#!/bin/bash
IMAGENAME='screenlogic-api'
SHORTGITHASH=$(git rev-parse --short HEAD)
docker build --pull -t michaelmucciarone/$IMAGENAME:latest .
docker tag michaelmucciarone/$IMAGENAME:latest michaelmucciarone/$IMAGENAME:$SHORTGITHASH
docker push michaelmucciarone/$IMAGENAME:latest
docker push michaelmucciarone/$IMAGENAME:$SHORTGITHASH