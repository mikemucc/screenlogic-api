# Screenlogic-API

An API built on top of Parnic's [node-screenlogic](https://github.com/parnic/node-screenlogic) library.

Still a work in progress.

## Setup and usage

To set up, clone this repo then run `npm install`.

### Envorinment Variables

You can modify the behavoir of the server with the following environment variables:

* `BASE_PATH` : Base path the for API routes. Defaults to `/api`.  
* `POLL_INTERVAL` : How often to poll the backend screenlogic device. Defaults to 5 seconds.  
* `PORT` : Specify what port for the express server to listen on.  
* `SL_IP_ADDRESS` : IP Address of your screenlogic device.  
* `SL_PORT` : Port your Screenlogic device is listening on.  
* `SL_NAME` : (Optional) Name of your ScreenLogic unit.  

**Important**: if you specify `SL_IP_ADDRESS` and `SL_PORT`, the server will not broadcast for a screenlogic device on the network, it will attempt to connect to your screenlogic at the IP Address and port specified. This is especially useful in a situation where the broadcast address on the network that the screenlogic unit is attached to is unreachable, such as if running this in a docker container.

## Endpoints

### GET methods

| Endpoint | Function |
|----------|----------|
|`/api/all` | Return all data about the screenlogic device (that I can currently get via Parnic's library)|
| `/api/raw` | Return the raw data from the library, bypassing any data massaging or interpreting that the api is doing |

### PUT methods

#### Circuit activate/deactivate

| Endpoint | Function | Notes |
|----------|----------|-------|
|`/api/:circuit/:state` | Turn any circuit on or off. `circuit` should be an integer between 500 and 600, `state` should be 1 (on) or 0 (off)| The `/api/all` endpoint will return an object that lists all of the circuit definitions for your system under `controllerconfig.circuits[]`.|

##### Convenience Methods

| Endpoint | Function | Notes |
|----------|----------|-------|
|`/api/pool/on` | Set the screenlogic device to pool mode and turn it on | This is the functional equilivent of sending `PUT /api/505/1` |
|`/api/pool/off` | Set the screenlogic device to pool mode and turn it on| This is the functional equilivent of sending `PUT /api/505/0` |
|`/api/spa/on` | Set the screenlogic device to spa mode and turn it on | This is the functional equilivent of sending `PUT /api/500/1` |
| `/api/spa/off` | Set the screenlogic device to spa mode and turn it on | This is the functional equilivent of sending `PUT /api/500/0`|

#### Heater Control

| Endpoint | Function | Notes |
|----------|----------|-------|
|`/api/:body/heater/setpoint/:temp` | Set the heater setpoint (i.e. temperature) for the given `body`. `body` should be either `pool` or `spa`; `temp` should be the temperature you want to set the setpoint to. | The temperature should be in whatever scale your pool is set to (i.e. Celcius or Farenheit). |
|`/api/:body/heater/mode/:mode` | Set the heater operation mode for the given body. |`body` should be either `pool` or `spa`; `mode` is an integer from 0 - 4 |

`mode` is an integer from 0 - 4 with the following meanings:
| Mode Integer | Meaning |
|--------------|---------|
| 0 | Off|
| 1 | Solar |
| 2 | Solar Preferred |
| 3 | Heat Pump |
| 4 | No Change |
