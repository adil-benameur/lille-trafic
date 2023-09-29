/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const date = require('date-and-time')

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient();

const getLastSubwayStatus = async () => {
    let startDate = Date.now();
    while(true) {
        startDate -= 1000 * 60
        
        const date_formated = date.format(new Date(startDate), "YYYYMMDDTHHmm00")
      
        const input = {
          "ExpressionAttributeValues": {
            ":v1": {
              "S": date_formated
            }
          },
          "KeyConditionExpression": "RequestDatetime = :v1",
          "TableName": "lilletrafic-subway_monitor_db"
        };
      
        const command = new QueryCommand(input);
        const result = await client.send(command)
    
        if(result.Items.length > 0) {
            return result.Items[0]
        }
    }
}

const getAllLinesDisruptions = (disruptions) => {
    let speakOutput = ""
    if(disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length === 0 && disruptions['Disruptions']['M']['line:TRA:ME2']['L'].length === 0)
        speakOutput = "Aucune perturbation n'est en cours sur les lignes de métro !";
    else {
        if(disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length > 0) {
            const disruption_count = disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length;
            
            speakOutput += `${disruption_count > 1 ? disruption_count + " perturabations sont " : disruption_count + " perturabation est "} perturbations en cours sur la ligne 1 du métro.`
            speakOutput += disruptions['Disruptions']['M']['line:TRA:ME1']['L'].map(disp => disp['S'])
        }
        
        if(disruptions['Disruptions']['M']['line:TRA:ME2']['L'].length > 0) {
            const disruption_count = disruptions['Disruptions']['M']['line:TRA:ME1']['L'].length;
            
            speakOutput += `${disruption_count > 1 ? disruption_count + " perturabations sont " : disruption_count + " perturabation est "} perturbations en cours sur la ligne 2 du métro.`
            speakOutput += disruptions['Disruptions']['M']['line:TRA:ME2']['L'].map(disp => disp['S'])
        }
    }
    return speakOutput
}


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const disruptions = await getLastSubwayStatus()
        
        let speakOutput = "Bonjour, "
        speakOutput += getAllLinesDisruptions(disruptions);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SubwayStateIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SubwayState';
    },
    async handle(handlerInput) {
        const disruptions = await getLastSubwayStatus()
    
        let speakOutput;
        if(handlerInput?.requestEnvelope?.request?.intent?.slots && "line_number" in handlerInput['requestEnvelope']['request']['intent']['slots']) {
            const line_number = handlerInput['requestEnvelope']['request']['intent']['slots']['line_number']['slotValue']['value']
            
            if(disruptions['Disruptions']['M']['line:TRA:ME' + line_number]['L'].length === 0)
                speakOutput = `Aucunes perturbations n'est en cours sur la ligne de métro ${line_number} !`;
            else {
                const disruption_count = disruptions['Disruptions']['M']['line:TRA:ME' + line_number]['L'].length;
                
                speakOutput += `${disruption_count > 1 ? disruption_count + " perturabations sont " : disruption_count + " perturabation est "} en cours sur la ligne ${line_number} du métro.`
                speakOutput += disruptions['Disruptions']['M']['line:TRA:ME' + line_number]['L'].map(disp => disp['S'])
            }
            
        } else {
            speakOutput = getAllLinesDisruptions(disruptions)
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

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
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

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
        const speakOutput = "Une erreur s'est produite";
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
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler
        )
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();