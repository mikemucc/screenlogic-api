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
* `FEATURES_LOCATION` : (Optional) Section you would like to see anything you've defined as showing up in the "Features" section in the ScreenLogic app. Valid options are `spa` and `pool`.

**Important**: if you specify `SL_IP_ADDRESS` and `SL_PORT`, the server will not broadcast for a screenlogic device on the network, it will attempt to connect to your screenlogic at the IP Address and port specified. This is especially useful in a situation where the broadcast address on the network that the screenlogic unit is attached to is unreachable, such as if running this in a docker container.

## Endpoints

### GET methods

| Endpoint | Function | Notes |
|----------|----------|-------|
|`/api/all` | Return all data about the screenlogic device (that I can currently get via Parnic's library)| This is suitable for use by a Front End UI|
| `/api/raw` | Return the raw data from the library, bypassing any data massaging or interpreting that the api is doing | This is suitable for debugging purposes|

### PUT methods

#### Circuit activate/deactivate

| Endpoint | Function | Notes |
|----------|----------|-------|
|`/api/circuit/:circuit/:state` | Turn any circuit on or off. `circuit` should be an integer between 500 and 600 corresponding to the circuit you wish to modify, `state` should be 1 (on) or 0 (off)| The `/api/all` endpoint will return an object that lists all of the circuit definitions for your system under `controllerConfig.bodyArray[]`.|

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

#### Lights

| Endpoint | Function | Notes |
|----------|----------|-------|
|`/api/lights/:command`| Execute a Light command | This should be a integer from 0 - 17, see below|

This is the config object I'm using in the angular UI.

``` ts
[
  {
    text: "Lights Off",
    buttonType : "primary",
    commandInt: 0,
    commandString: "ScreenLogic.LIGHT_CMD_LIGHTS_OFF",
    visible: false,
    pallet: "OnOff",
    color: null
  },
  {
    text: "Lights On",
    buttonType : "primary",
    commandInt: 1,
    commandString: "ScreenLogic.LIGHT_CMD_LIGHTS_ON",
    visible: false,
    pallet: "OnOff",
    color: null
  },
]

export const COLORLIGHTBUTTONS: LightButton[] = [
  {
    text: "Set",
    buttonType : "primary",
    commandInt: 2,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_SET",
    visible: true,
    pallet: "Color Lights",
    color: null
  },
  {
    text: "Sync",
    buttonType : "primary",
    commandInt: 3,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_SYNC",
    visible: true,
    pallet: "Color Lights",
    color: null
  },
  {
    text: "Swim",
    buttonType : "basic",
    commandInt: 4,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_SWIM",
    visible: true,
    pallet: "Color Lights",
    color: null
  },
]

export const INTELLIBRITEBUTTONS: LightButton[] = [
  {
    text: "Party",
    buttonType : "basic",
    commandInt: 5,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_MODE_PARTY",
    visible: true,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "Romance",
    buttonType : "basic",
    commandInt: 6,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_MODE_ROMANCE",
    visible: true,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "Caribbean",
    buttonType : "basic",
    commandInt: 7,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_MODE_CARIBBEAN",
    visible: true,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "American",
    buttonType : "basic",
    commandInt: 8,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_MODE_AMERICAN",
    visible: true,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "Sunset",
    buttonType : "basic",
    commandInt: 9,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_MODE_SUNSET",
    visible: true,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "Royal",
    buttonType : "basic",
    commandInt: 10,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_MODE_ROYAL",
    visible: true,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "Save",
    buttonType : "basic",
    commandInt: 11,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_SET_SAVE",
    visible: false,
    pallet: "IntelliBrite",
    color: null
  },
  {
    text: "Recall",
    buttonType : "basic",
    commandInt: 12,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_SET_RECALL",
    visible: false,
    pallet: "IntelliBrite",
    color: null
  },

]

export const SOLIDCOLORBUTTONS: LightButton[] = [
  {
    text: "Blue",
    buttonType : "mat-fab",
    commandInt: 13,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_BLUE",
    visible: true,
    pallet: "Solid Colors",
    color: "#2400c7"
  },
  {
    text: "Green",
    buttonType : "mat-fab",
    commandInt: 14,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_GREEN",
    visible: true,
    pallet: "Solid Colors",
    color: "#00a008"
  },
  {
    text: "Red",
    buttonType : "mat-fab",
    commandInt: 15,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_RED",
    visible: true,
    pallet: "Solid Colors",
    color: "#c20000"
  },
  {
    text: "White",
    buttonType : "mat-fab",
    commandInt: 16,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_WHITE",
    visible: true,
    pallet: "Solid Colors",
    color: "#ffffff"
  },
  {
    text: "Purple",
    buttonType : "mat-fab",
    commandInt: 17,
    commandString: "ScreenLogic.LIGHT_CMD_COLOR_PURPLE",
    visible: true,
    pallet: "Solid Colors",
    color: "#d800ff"
  }
]
```