#!/bin/bash

#The location of the gmail api client 
GAPI_CLIENT_FILE=$PWD/js/gapi_client.js

#If the gapi client has been updated get the latest version and save it to our local gapi client file
#This is required since we can't load the remote script at runtime due to the remote script execution limitations for chrome extension
curl -o $GAPI_CLIENT_FILE -z $GAPI_CLIENT_FILE https://apis.google.com/js/platform.js