Examples
========
In order to run a given function, navigate (cd) to the `Examples` directory and run the example file, like so:
```
node ./simepleExample.js
```

simpleExample.js
----------------
A simple example that shows setting lights and fan speeds

largerExample.js
----------------
A example that expands on simpleExample.js showing more features and knobs you can turn

fastDimLights.js
----------------
Dims the light extremely quickly - without querying the fan for any info!
This (and similar functions) are very helpful when running commands as keyboard shortcuts.

You must first get the fan's information from `getFanInfo.js`

getFanInfo.js
-------------
Run this function to get information about the fan, useful for skipping fan scanning like in the fastDimLights example.