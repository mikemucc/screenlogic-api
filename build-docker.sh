#!/bin/bash
SHORTGITHASH=$(git rev-parse --short HEAD)
docker build -t michaelmucciarone/screenlogic-api:latest .
docker tag michaelmucciarone/screenlogic-api:latest michaelmucciarone/screenlogic-api:$SHORTGITHASH
# docker push michaelmucciarone/screenlogic-api:latest
# docker push michaelmucciarone/screenlogic-api:$SHORTGITHASH