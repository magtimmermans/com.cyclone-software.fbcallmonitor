# Fritz Box Call Monitor

This is a call monitor for Fritz.Box routers. You can switch on/off the call monitor on your device with:

  - #96\*5* – Callmonitor on
  - #96\*4* – Callmonitor off

###triggers
    - Incomming call
    - Call Anwsered
    - Call ended
    - Outgoing call

### v0.2.3
Fixed trigger errors

### v0.2.2 
fixed crash in case of error. 
KNOWN BUG: After changing your IP Adress please restart the app! 

### v0.2.0
upgraded to Homey V2 and SDK 2.
**!!Removed** the Dect200 as item to the call monitor. So now you can **NOT** control your DECT wall sockets from within your Homey using this App.
(I do not have this system and could also not supported it anymore. The developer at that time did also not have this system anymore and had no time to upgrade this part)

### v 0.0.9
Added the Dect200 as item to the call monitor. So now you can control your DECT wall sockets from within your Homey.
Supported capabilities of the DECT 200: onoff, meter_power and measure_power.

### v 0.0.8 
Added trigger for outgoing call

### v 0.0.7
Small fix for homeys that have older software versions

### v 0.0.6
Added current date & time to triggers Incomming Call & Call Anwsered

### v 0.0.5
Changed localize bug.

### v 0.0.4
In this release we have added the phonebook list from Fritz.Box. Unfortunatly we could not make an automatic update between Fritz.Box and Homey. The way I solved it is download the phonebook from FritzBox and copy the contents in the box on the settings screen. This is the best I could do. Currently it is experimental and only tested with the phonebook from FritzBox 06.52. Only one phonebook is currently supported.


### v 0.0.3
bugfix socket did not close and some typo's

### v 0.0.2
bugfix condition cards. This works now correctly.


### v 0.0.1
First release




