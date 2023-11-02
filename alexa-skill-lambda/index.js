/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const axios = require('axios');
const util = require('util')

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient();

const dynamodbTableName = process.env['DYNAMODB_TABLE_NAME'];
const navitiaApiToken = process.env['NAVITIA_API_TOKEN']

const navitiaApi = axios.create({
    baseURL: 'https://api.navitia.io/v1',
})
navitiaApi.defaults.headers.common['Authorization'] = navitiaApiToken;

const getLastSubwayStatus = async () => {
    const input = {
        "ExpressionAttributeValues": {
            ":v1": {
                "S": "latest_state"
            }
        },
        "KeyConditionExpression": "RequestDatetime = :v1",
        "TableName": dynamodbTableName
    };

    const command = new QueryCommand(input);
    const result = await client.send(command);
    if (result.Items.length > 0)
        return result.Items[0];
}

const getAllLinesDisruptions = (disruptions) => {
    let speakOutput = ""
    if (disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length === 0 && disruptions['Disruptions']['M']['line:TRA:ME2']['L'].length === 0)
        speakOutput = "Aucune perturbation n'est en cours sur les lignes de métro !";
    else {
        if (disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length > 0) {
            const disruption_count = disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length;

            speakOutput += `${disruption_count > 1 ? disruption_count + " perturabations sont " : disruption_count + " perturabation est "} perturbations en cours sur la ligne 1 du métro.`
            speakOutput += disruptions['Disruptions']['M']['line:TRA:ME1']['L'].map(disp => disp['S'])
        }

        if (disruptions['Disruptions']['M']['line:TRA:ME2']['L'].length > 0) {
            const disruption_count = disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length;

            speakOutput += `${disruption_count > 1 ? disruption_count + " perturabations sont " : disruption_count + " perturabation est "} perturbations en cours sur la ligne 2 du métro.`
            speakOutput += disruptions['Disruptions']['M']['line:TRA:ME2']['L'].map(disp => disp['S'])
        }
    }
    return speakOutput
}

function lowerFirstLetter(string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        console.log(handlerInput);
        let speakOutput;
        try {
            const disruptions = await getLastSubwayStatus()

            speakOutput = "Bonjour, ici LilleTrafic. "
            if (disruptions) {
                speakOutput += getAllLinesDisruptions(disruptions);
                speakOutput += ' Vous pouvez me demander l\'état de fonctionnement du métro ou bien le temps de trajet jusqu\'à une destination.';

                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt(speakOutput)
                    .getResponse();
            }
        } catch (e) {
            console.error(e);
        }

        speakOutput = "Le service LilleTrafic est actuellement indisponible.";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const SubwayStateIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SubwayState';
    },
    async handle(handlerInput) {
        console.log(handlerInput);
        let speakOutput;
        try {
            const disruptions = await getLastSubwayStatus()

            if (handlerInput?.requestEnvelope?.request?.intent?.slots && "line_number" in handlerInput?.requestEnvelope?.request?.intent?.slots && handlerInput?.requestEnvelope?.request?.intent?.slots?.line_number?.slotValue) {
                const line_number = handlerInput['requestEnvelope']['request']['intent']['slots']['line_number']['slotValue']['value']

                if (disruptions['Disruptions']['M']['line:TRA:ME' + line_number]['L'].length === 0)
                    speakOutput = `Aucune perturbation n'est en cours sur la ligne de métro ${line_number} !`;
                else {
                    const disruption_count = disruptions['Disruptions']['M']['line:TRA:ME' + line_number]['L'].length;

                    speakOutput += `${disruption_count > 1 ? disruption_count + " perturabations sont " : disruption_count + " perturabation est "} en cours sur la ligne ${line_number} du métro.`
                    speakOutput += disruptions['Disruptions']['M']['line:TRA:ME' + line_number]['L'].map(disp => disp['S'])
                }

            } else {
                speakOutput = getAllLinesDisruptions(disruptions)
            }
        } catch (e) {
            console.error(e);
            speakOutput = "Une erreur s'est produite. Pouvez-vous répéter ?";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const JourneyDurationIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'JourneyDuration';
    },
    async handle(handlerInput) {
        let speakOutput;

        try {
            console.log(handlerInput['requestEnvelope']['request']['intent']);

            var isGeoSupported = handlerInput?.requestEnvelope?.context?.System?.device?.supportedInterfaces?.Geolocation;
            var geoObject = handlerInput?.requestEnvelope?.context?.Geolocation;
            if (isGeoSupported && geoObject && geoObject.coordinate) {
                if (handlerInput?.requestEnvelope?.request?.intent?.slots &&
                    "place" in handlerInput?.requestEnvelope?.request?.intent?.slots &&
                    handlerInput?.requestEnvelope?.request?.intent?.slots?.place?.value) {
                    const place = handlerInput['requestEnvelope']['request']['intent']['slots']['place']['value']

                    const stopsResponse = await navitiaApi(`/coverage/fr-npdc/pt_objects?disable_geojson=true&q=${encodeURI(place).replace("quatre", "4") // fix for 4 Cantons station 
                        }`);

                    let to = null;
                    console.log(util.inspect(stopsResponse))
                    if (stopsResponse.data['pt_objects']?.length > 0) {
                        to = stopsResponse.data['pt_objects'][0]['id'];
                    } else {
                        const placesResponse = await navitiaApi(`/coverage/fr-npdc/places?disable_geojson=true&q=${encodeURI(place)}`);

                        console.log(util.inspect(placesResponse.data))
                        if (placesResponse.data['places']?.length > 0) {
                            to = placesResponse.data['places'][0]['id'];
                        }
                    }

                    if (to != null) {
                        try {
                            const journeyResponse = await navitiaApi(`/coverage/fr-npdc/journeys?disable_geojson=true&from=${geoObject.coordinate.longitudeInDegrees};${geoObject.coordinate.latitudeInDegrees}&to=${to}&first_section_mode[]=walking&last_section_mode[]=walking&datetime_represents=departure&forbidden_uris[]=physical_mode:Bus`);

                            console.log(util.inspect(journeyResponse.data))
                            if (journeyResponse.data['journeys']?.length > 0) {
                                const journey = journeyResponse.data['journeys'][0];
                                const minDurationInSeconds = journey['duration'];

                                speakOutput = `Votre temps de trajet est estimé à ${Math.round(minDurationInSeconds / 60)} minutes`

                                let count = 0;
                                journey['sections'].forEach(section => {
                                    if ('display_informations' in section) {
                                        if (section['display_informations']['label'] === 'M1') {
                                            if (count > 0)
                                                speakOutput += " puis";
                                            speakOutput += ` en emprumtant la ligne 1 de l'arrêt ${section['from']['stop_point']['name']} à l'arrêt ${section['to']['stop_point']['name']}`

                                            count++;
                                        }

                                        if (section['display_informations']['label'] === 'M2') {
                                            if (count > 0)
                                                speakOutput += " puis";
                                            speakOutput += ` en emprumtant la ligne 2 de l'arrêt ${section['from']['stop_point']['name']} à l'arrêt ${section['to']['stop_point']['name']}`

                                            count++;
                                        }
                                    }
                                });
                                speakOutput += ".";
                            }
                        } catch (e) {
                            speakOutput = "Il semblerait que votre localisation soit trop éloignée pour calculer un trajet."
                        }
                    } else {
                        speakOutput = `Désole, je n'ai pas réussi localiser votre destination.`
                    }
                } else {
                    speakOutput = "Je n'ai pas compris. Pouvez-vous répéter ?"
                }
            } else {
                speakOutput = "LilleTrafic souhaite utiliser votre position. Pour activer le partage de position, veuillez accéder à votre application Alexa et en suivre les instructions."

                console.log("speakOutput", speakOutput);
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .withAskForPermissionsConsentCard(['alexa::devices:all:geolocation:read'])
                    .getResponse();
            }
        } catch (e) {
            console.error(e);
            speakOutput = "Une erreur s'est produite. Pouvez-vous répéter ?";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        console.log(handlerInput);
        const speakOutput = 'Vous pouvez me demander l\'état de fonctionnement du métro ou bien le temps de trajet jusqu\'à une destination. Comment puis-je vous aider ?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        console.log(handlerInput);
        const speakOutput = 'Au revoir !';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Désole, je n\'ai pas compris. Pouvez-vous répéter ?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.

        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = "Une erreur s'est produite.";
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SubwayStateIntentHandler,
        JourneyDurationIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler
    )
    .addErrorHandlers(
        ErrorHandler)
    .lambda();