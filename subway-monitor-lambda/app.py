import requests
import os
import urllib.parse
import boto3
from cerealbox.dynamo import as_dynamodb_json
import time    

dynamodb_client = boto3.client('dynamodb')
table_name = os.environ['DYNAMODB_TABLE_NAME']

NAVITIA_API_TOKEN = os.environ['NAVITIA_API_TOKEN']

base_url_API = 'https://api.navitia.io'
headers = {
    'Authorization': NAVITIA_API_TOKEN,
}

traffic_reports_url = "/v1/coverage/fr-npdc/traffic_reports"

def lambda_handler(event, context):
    disruptions_per_line = {
        'line:TRA:ME1': [],
        'line:TRA:ME2': []
    }

    r = requests.get(urllib.parse.urljoin(base_url_API, traffic_reports_url), headers=headers)
    if(r.status_code != 200):
        print("Error occured with request", r.request.headers)
        return
    
    if('disruptions' in r.json() and len(r.json()['disruptions']) > 0):
        for disruption in r.json()['disruptions']:
            
            # Filter only for subway lines impacted
            impacted_objects = list(filter(lambda object: object['pt_object']['id'] in ['line:TRA:ME1', 'line:TRA:ME2'], disruption['impacted_objects']))
            if(len(impacted_objects) > 0 and disruption['severity']['effect'] == 'NO_SERVICE'):
                for object in impacted_objects:
                    print("Disruption on line %s" % object['pt_object']['id'])

                    revelant_messages = filter(lambda message: message['channel']['name'] == 'web et mobile', disruption['messages'])
                    longuest_message = max(disruption['messages'], key=lambda message: len(message['text']))
                    print(longuest_message['text'])
                    
                    disruptions_per_line[object['pt_object']['id']].append(longuest_message['text'])
    
    datetime = r.json()['context']['current_datetime']
    # Stripe seconds from datetime
    datetime = datetime[:-2] + "00"
    
    # Expire in 1 year
    one_year = 60 * 60 * 24 * 365
    expiration_time = int(time.time()) + one_year

    item = {
        'RequestId': {'S': context.aws_request_id},
        'RequestDatetime': {'S': datetime},
        'Disruptions': as_dynamodb_json(disruptions_per_line),
        'ExpirationTime': {'N': str(expiration_time)}
    }
    dynamodb_client.put_item(TableName=table_name, Item=item)

    return item