// stole 99% of the code from https://codepen.io/josfabre/pen/KKLwxbE
import * as lilGui from 'https://esm.run/lil-gui';
import * as mqtt from 'https://esm.run/mqtt';

// ------------------------------- TODO LIST ----------------------------------
// (DONE) decide what HCI data were gonna use
//   (DONE) write a parser to interpret and store mqtt data
//   (DONE) render HCI data in the lil-gui for debugging purposes
//   (DONE) add a data simulator for testing purposes
// * decide what we are going to do with the HCI data
//   (DONE) normalize error data via interpolation or something else idk (done with buffer rn)
//   * add visual effects to drive engagement
//     * sound effects, flashing lights, particles, shitty greenscreen overlays, etc...
//     * mess around with animation via cubic brezier curve to generate excitement??
//   (DONE) add logic to determine the win rate
//     (DONE) change loss rate to lower when user is getting bored?
//     (DONE) change ratio of win rate to increase chance of big hits and reduce low hits to compensate
//     (DONE) use long term data to determine average emotional state??
// (DONE) add money to site and bet sizes
// (DONE) clean up the site
//   (DONE) site can scroll a little, remove overflow or something
//   (DONE) add indicator when slot machine is ready (which includes if mqtt connected?)
//   (XXXX) figure out how to make it bigger?? (looks difficult and might not be worth)
//   (DONE) add a favicon
// (DONE) remove nodejs entirely and move to github (it only is used to host rn)
// * clean up the codebase
// * add a way to rig it using mqtt to exaggerate effects of EEG on the project
//   * this is just for presenting (if we have to and if our project turns out shit) 



const client = mqtt.default.connect('wss://test.mosquitto.org:8081')
const gui = new lilGui.GUI();
gui.domElement.style.right = '0px';

let spinning = false;
let connected = false;
let debugMode = false;
let simulate = false;
let hciData = {
    Type: "AFFECT",
    Interest: 0.5,
    Engagement: 0.5,
    Excitement: 0.5,
    Time: 0
}
const dataBuffer = []

let baselineEngagement = null
let baselineExcitement = null

let spinCount = 0
let defaultLossRate = 0.8;
let lossRate = 0.8;

let totalMoney = 1000
let rollProfit = 0
let betSize = 100

const sounds = {
    spin: new Audio('./sounds/slotmachine.mp3'),
    win: new Audio('./sounds/yipee.mp3'),   
    lose: new Audio('./sounds/metalpipe.mp3')
};

let soundVolume = 0.5;
sounds.spin.volume = soundVolume;
sounds.win.volume = soundVolume;
sounds.lose.volume = soundVolume;

// Adds Volume Slider to GUI
gui.add({ soundVolume }, 'soundVolume', 0, 1, 0.1).name('Sound Volume').onChange((value) => {
    soundVolume = value;
    sounds.spin.volume = value;
    sounds.win.volume = value;
    sounds.lose.volume = value;
});

let winRates = {
    "seven": { index: 1, multiplier: 25, chance: 0.05 },
    "tripleBar": { index: 6, multiplier: 10, chance: 0.1 },
    "bell": { index: 5, multiplier: 7.5, chance: 0.1 },
    "watermelon": { index: 8, multiplier: 5, chance: 0.1 },
    "orange": { index: 4, multiplier: 2.5, chance: 0.15 },
    "grape": { index: 3, multiplier: 2, chance: 0.15 },
    "cherry": { index: 1, multiplier: 1.5, chance: 0.1 },
    "lemon": { index: 7, multiplier: 1, chance: 0.15 },
    "banana": { index: 0, multiplier: 0.5, chance: 0.1 }
};

// ----------------------------- DEBUG LOGIC ----------------------------------
const debugModeCheckbox = gui.add({ debugMode: debugMode }, 'debugMode').name('Debug Mode?').onChange((value) => {
    debugMode = value;
    updateLoaderState()
    toggleSliders()
});
const lossRateSlider = gui.add({ lossRate: lossRate }, 'lossRate', 0, 1).name('Loss Rate').onChange((value) => {
    lossRate = value;
});

const simulateCheckbox = gui.add({ simulate: simulate }, 'simulate').name('Simulate PAD?').onChange((value) => {
    simulate = value;
    if (simulate) {
        const simulateInterval = setInterval(() => {
            // // Simulate via MQTT
            const speed = 0.02
            if (connected) {
                client.publish("javier/hci/XXXX", `{"Interest":${Math.abs(Math.sin(speed * Math.PI * (Date.now() / 1000)))},"Engagement":${Math.abs(Math.sin(speed * Math.PI * (Date.now() / 1000) + (0.25 * Math.PI)))},"Excitement":${Math.abs(Math.sin(speed * Math.PI * (Date.now() / 1000) + (0.5 * Math.PI)))},"Type":"AFFECT","Time":${Date.now() / 1000}}`);
            }

            if (!simulate) {
                clearInterval(simulateInterval);
            }
        }, 50);
    }
});

const hciDataSliders = {
    Interest: hciData.Interest,
    Engagement: hciData.Engagement,
    Excitement: hciData.Excitement
};
const interestSlider = gui.add(hciDataSliders, 'Interest', 0, 1).name('Interest').onChange((value) => {
    hciData.Interest = value;
    updateBodyBackground();
});
const engagementSlider = gui.add(hciDataSliders, 'Engagement', 0, 1).name('Engagement').onChange((value) => {
    hciData.Engagement = value;
    updateBodyBackground();
});
const excitementSlider = gui.add(hciDataSliders, 'Excitement', 0, 1).name('Excitement').onChange((value) => {
    hciData.Excitement = value;
    updateBodyBackground();
});

function toggleSliders() {
    const elements = [lossRateSlider, simulateCheckbox, interestSlider, engagementSlider, excitementSlider];
    elements.forEach(element => {
        element.domElement.style.pointerEvents = debugMode ? 'auto' : 'none';
        element.domElement.style.opacity = debugMode ? '1' : '0.5';
    });
}

toggleSliders()

// ------------------------------  MQTT LOGIC  --------------------------------
client.on("connect", () => {
    client.subscribe("javier/hci/XXXX", (err) => {
        if (!err) {
            console.log("MQTT Client connected to \"javier/hci/XXXX\"")
            connected = true
            updateLoaderState()
        }
    });
});

// WILL DISCONNECT AND AUTO RECONNECT AFTER IT GETS KICKED FOR INACTIVITY
// Detect disconnection
client.on('close', () => {
    console.log('Disconnected from MQTT broker');
    connected = false
    updateLoaderState()
});
// Detect reconnection
client.on('reconnect', () => {
    console.log('Reconnecting to MQTT broker...');
});

client.on("message", (topic, message) => {
    // console.log(message.toString());
    if (setHCIData(message.toString())) {
        // console.log("Updated PAD via MQTT")
        updateLoaderState()
    }
});

let dataTimeoutId;
function startDataTimeout() {
    dataTimeoutId = setTimeout(() => {
        updateLoaderState();
    }, 5500);
}

function setHCIData(message) {
    try {
        const parsedData = JSON.parse(message);
        if (parsedData.Type == "AFFECT") {
            hciData.Interest = parsedData.Interest;
            hciData.Engagement = parsedData.Engagement;
            hciData.Excitement = parsedData.Excitement;
            hciData.Time = parsedData.Time

            interestSlider.setValue(hciData.Interest);
            engagementSlider.setValue(hciData.Engagement);
            excitementSlider.setValue(hciData.Excitement);
            
            dataBuffer.push({...hciData});
            removeOldData();
            
            updateBodyBackground();
            // Add timeout to show loading if no more data is recieved in 5 seconds
            clearTimeout();
            startDataTimeout()

            return hciData;
        } else {
            return null;
        }
    } catch (err) {
        console.error("Invalid JSON:", error);
        return null;
    }
}

// -----------------------------  DISPLAY LOGIC  ------------------------------

function updateTotal(amount) {
    totalMoney += amount
    document.getElementById('total').textContent = 'TOTAL: $' + totalMoney;
}

function updateBet(amount) {
    betSize = Math.min(totalMoney, betSize + amount)
    document.getElementById('bet').textContent = 'BET: $' + betSize;
}

function updateLoaderState() {
    const loader = document.querySelector('.loader');
    const loadingText = document.querySelector('#loading-text');
    const loaderContainer = document.getElementById('loader-container');
    
    if ((connected && Math.floor(Date.now() / 1000) - hciData.Time <= 5) || debugMode) {
        // ready
        loader.classList.add('hidden');
        loadingText.classList.add('hidden');
        loaderContainer.classList.remove('loading-background');
        loaderContainer.classList.add('hidden');
    } else { // not ready
        loader.classList.remove('hidden');
        loadingText.classList.remove('hidden');
        loaderContainer.classList.add('loading-background');
        loaderContainer.classList.remove('hidden');

        if (!connected && hciData.Time == 0) {
            loadingText.textContent = 'Connecting to broker...';
        } else if (!connected && hciData.Time != 0) {
            loadingText.textContent = 'Reconnecting to broker...';
        } else if (connected && Math.floor(Date.now() / 1000) - hciData.Time > 5) {
            loadingText.textContent = 'Waiting for EEG data...';
        }
        
    }
}
updateLoaderState()

// Mapping of indexes to icons: start from banana in middle of initial position and then upwards
const iconMap = ["banana", "seven", "cherry", "plum", "orange", "bell", "bar", "lemon", "melon"];
// Width of the icons
const icon_width = 79;
// Height of one icon in the strip
const icon_height = 79;
// Number of icons in the strip
const num_icons = 9;
// Max-speed in ms for animating one icon down
const time_per_icon = 100;
// Holds icon indexes
const indexes = [0, 0, 0];

// Roll one reel
const roll = (reel, offset = 0, target) => {
  // Minimum of 2 + the reel offset rounds
  let delta = (offset + 2) * num_icons + Math.round(Math.random() * num_icons);

  const style = getComputedStyle(reel),
  // Current background position
  backgroundPositionY = parseFloat(style["background-position-y"]);

  const currentIndex = backgroundPositionY / icon_height;
  delta = target - currentIndex + (offset + 2) * num_icons;

  // Return promise so we can wait for all reels to finish
  return new Promise((resolve, reject) => {
    const
    // Target background position
    targetBackgroundPositionY = backgroundPositionY + delta * icon_height,
    // Normalized background position, for reset
    normTargetBackgroundPositionY = targetBackgroundPositionY % (num_icons * icon_height);

    // Delay animation with timeout, for some reason a delay in the animation property causes stutter
    setTimeout(() => {
      // Set transition properties ==> https://cubic-bezier.com/#.41,-0.01,.63,1.09
      reel.style.transition = `background-position-y ${(8 + 1 * delta) * time_per_icon}ms cubic-bezier(.41,-0.01,.63,1.09)`;
      // Set background position
      reel.style.backgroundPositionY = `${backgroundPositionY + delta * icon_height}px`;
    }, offset * 150);

    // After animation
    setTimeout(() => {
      // Reset position, so that it doesn't get higher without limit
      reel.style.transition = `none`;
      reel.style.backgroundPositionY = `${normTargetBackgroundPositionY}px`;
      // Resolve this promise
      resolve(delta % num_icons);
    }, (8 + 1 * delta) * time_per_icon + offset * 150);

  });
};

// Roll all reels, when promise resolves roll again
function rollAll(targets) {
  const reelsList = document.querySelectorAll('.slots > .reel');

  Promise

  // Activate each reel, must convert NodeList to Array for this with spread operator
  .all([...reelsList].map((reel, i) => roll(reel, i, targets[i])))

  // When all reels done animating (all promises solve)
  .then(deltas => {
    // add up indexes
    deltas.forEach((delta, i) => indexes[i] = (indexes[i] + delta) % num_icons);
    
    spinning = false
    
    // Win conditions
    if (indexes[0] == indexes[1] && indexes[1] == indexes[2]) {
        sounds.win.currentTime = 0; 
        sounds.win.play();
        const winCls = indexes[0] == indexes[2] ? "win2" : "win1";
        
        updateTotal(rollProfit)

        document.querySelector(".slots").classList.add(winCls)
        setTimeout(() => {
            document.querySelector(".slots").classList.remove(winCls);
            
        }, 2000);
    } else {
        sounds.lose.currentTime = 0;
        sounds.lose.play();
    }
  });
};

function updateBodyBackground() {
    const Excitement = Math.round(hciData.Excitement * 255);   // R
    const Engagement = Math.round(hciData.Engagement * 255);  // G
    const Interest = Math.round(hciData.Interest * 255); // B

    const color1 = `rgb(${Excitement}, ${Engagement}, ${Interest})`;
    const color2 = `rgb(${Math.min(Excitement + 50, 255)}, ${Math.min(Engagement + 50, 255)}, ${Math.min(Interest + 50, 255)})`;

    document.body.style.background = `linear-gradient(45deg, ${color1} 0%, ${color2} 100%)`;
}

updateBodyBackground();
// -----------------------------  ROLLING LOGIC  ------------------------------

function computeAverageEngagement() {
    if (dataBuffer.length === 0) {
        return null;
    }
  
    let sum = 0;
    for (const point of dataBuffer) {
        sum += point.Engagement;
    }
    return sum / dataBuffer.length;
}

function computeStdDeviationEngagement() {
    if (dataBuffer.length === 0) {
        return null
    }
    let average = computeAverageEngagement()
    let varianceSum = 0;
    for (const point of dataBuffer) {
        varianceSum += Math.pow(point.Engagement - average, 2);
    }
    const variance = varianceSum / dataBuffer.length;
    return Math.sqrt(variance);

}

function computeAverageExcitement() {
    if (dataBuffer.length === 0) {
        return null;
    }
  
    let sum = 0;
    for (const point of dataBuffer) {
        sum += point.Excitement;
    }
    return sum / dataBuffer.length;
}

function computeStdDeviationExcitement() {
    if (dataBuffer.length === 0) {
        return null
    }
    let average = computeAverageExcitement()
    let varianceSum = 0;
    for (const point of dataBuffer) {
        varianceSum += Math.pow(point.Excitement - average, 2);
    }
    const variance = varianceSum / dataBuffer.length;
    return Math.sqrt(variance);

}

function removeOldData() {
    const now = Date.now() / 1000;
    
    // remove any data over 10 seconds old
    while (dataBuffer.length > 0 && dataBuffer[0].Time < now - 10) {
        dataBuffer.shift();
    }
}

// calculates multiplier of how much money user will make on average
function calculateMultiplier(winRates, lossRate) {
    let totalReturn = 0;
    for (const symbol in winRates) {
        const { multiplier, chance } = winRates[symbol];
        totalReturn += multiplier * (chance);
    }

    return totalReturn * (1 - lossRate);
}

// (emotionalData) -> loss rate
function setLossRate() {
    if (baselineEngagement) {
        // value from -1 to 1
        let difference = computeAverageExcitement() - baselineEngagement

        // return rate from 0.7 - 0.9. higher above the baseline, higher the loss rate
        lossRate = defaultLossRate + Math.min(0.1, Math.max(-0.1, difference * 0.1))
    } else {
        lossRate = defaultLossRate
    }
    

    lossRateSlider.setValue(lossRate);
}

function setWinRate() {
    if (baselineEngagement) {
        let currentExcitement = computeAverageExcitement()
        let sd = computeStdDeviationExcitement()


        if (baselineEngagement + 2 * sd < currentExcitement) { // 95% confident engaged
            // unbalanced
            winRates = {
                "seven": { index: 1, multiplier: 25, chance: 0.10 },
                "tripleBar": { index: 6, multiplier: 10, chance: 0.25 },
                "bell": { index: 5, multiplier: 7.5, chance: 0.35 },
                "watermelon": { index: 8, multiplier: 5, chance: 0.15 },
                "orange": { index: 4, multiplier: 2.5, chance: 0.1 },
                "grape": { index: 3, multiplier: 2, chance: 0.05 },
                "cherry": { index: 1, multiplier: 1.5, chance: 0.0 },
                "lemon": { index: 7, multiplier: 1, chance: 0.0 },
                "banana": { index: 0, multiplier: 0.5, chance: 0.0 }
            };
            defaultLossRate = 0.9
            console.log("Playing with high-risk excitement")
        } else if (baselineEngagement - 2 * sd > currentExcitement) { // 95% confident unengaged
            // unbalanced
            winRates = {
                "seven": { index: 1, multiplier: 25, chance: 0.0 },
                "tripleBar": { index: 6, multiplier: 10, chance: 0.0 },
                "bell": { index: 5, multiplier: 7.5, chance: 0.0 },
                "watermelon": { index: 8, multiplier: 5, chance: 0.15 },
                "orange": { index: 4, multiplier: 2.5, chance: 0.2 },
                "grape": { index: 3, multiplier: 2, chance: 0.3 },
                "cherry": { index: 1, multiplier: 1.5, chance: 0.2 },
                "lemon": { index: 7, multiplier: 1, chance: 0.1 },
                "banana": { index: 0, multiplier: 0.5, chance: 0.05 }
            };
            defaultLossRate = 0.6
            console.log("Playing with low-risk excitement")
        } else { // default or 95% confident average engagement
            winRates = {
                "seven": { index: 1, multiplier: 25, chance: 0.05 },
                "tripleBar": { index: 6, multiplier: 10, chance: 0.1 },
                "bell": { index: 5, multiplier: 7.5, chance: 0.1 },
                "watermelon": { index: 8, multiplier: 5, chance: 0.1 },
                "orange": { index: 4, multiplier: 2.5, chance: 0.15 },
                "grape": { index: 3, multiplier: 2, chance: 0.15 },
                "cherry": { index: 1, multiplier: 1.5, chance: 0.1 },
                "lemon": { index: 7, multiplier: 1, chance: 0.15 },
                "banana": { index: 0, multiplier: 0.5, chance: 0.1 }
            };
            defaultLossRate = 0.8
            console.log("Playing with average excitement")
        }
    } else {
        // default
        winRates = {
            "seven": { index: 1, multiplier: 25, chance: 0.05 },
            "tripleBar": { index: 6, multiplier: 10, chance: 0.1 },
            "bell": { index: 5, multiplier: 7.5, chance: 0.1 },
            "watermelon": { index: 8, multiplier: 5, chance: 0.1 },
            "orange": { index: 4, multiplier: 2.5, chance: 0.15 },
            "grape": { index: 3, multiplier: 2, chance: 0.15 },
            "cherry": { index: 1, multiplier: 1.5, chance: 0.1 },
            "lemon": { index: 7, multiplier: 1, chance: 0.15 },
            "banana": { index: 0, multiplier: 0.5, chance: 0.1 }
        };
        defaultLossRate = 0.8
        console.log("Playing with no data excitement")
    }
    // console.log(calculateMultiplier(winRates, 0.8))
}


function calculateRiggedValues() {
    // Reset emotional baseline every spin
    baselineEngagement = computeAverageEngagement()
    baselineExcitement = computeAverageExcitement()
    
    // console.log("Base Engagement =", baselineEngagement)
    // console.log("Base Excitement =", baselineExcitement)
    // console.log("Spin Count =", spinCount)
    
    setLossRate();
    setWinRate()

    if (Math.random() < lossRate) { // Rig to lose
        console.log("Losing...");
        return generateLosing();
    } else { // Rig to win
        console.log("Winning!!!");
        return generateWinning(winRates);
    }
}

function pickSymbol() {
    return Math.floor(Math.random() * num_icons);
}

// () -> [cherry, bell, seven]
function generateLosing() {
    let out = [pickSymbol(), pickSymbol(), pickSymbol()];

    while (out[0] == out[1] && out[1] == out[2]) {
        out = [pickSymbol(), pickSymbol(), pickSymbol()];
    }

    return out;
}


// ENSURE WINRATES.CHANCE ADDS UP TO 1
// (win rates) -> [seven, seven, seven]
function generateWinning(winRates) {
    let cumulativeChance = 0;
    const randomNum = Math.random();
    for (const [key, value] of Object.entries(winRates)) {
        if (cumulativeChance <= randomNum && randomNum < cumulativeChance + value.chance) {
            rollProfit = value.multiplier * betSize
            return [value.index, value.index, value.index];
        }
        cumulativeChance += value.chance;
    }
    return null;
}




// ------------------------------  GAME LOGIC  --------------------------------
sounds.spin.loop = false;
function startRoll() {
    if (totalMoney - betSize >= 0 && !spinning && ((connected && Math.floor(Date.now() / 1000) - hciData.Time <= 5) || debugMode)) {
        spinning = true;
        spinCount++;
        updateTotal(-betSize);
        sounds.spin.currentTime = 0;
        sounds.spin.play();
        rollAll(calculateRiggedValues()).then(() => {
            sounds.spin.pause(); // Stop looping when done
        });
    }
}

document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        startRoll();
    } else if (event.code === 'ArrowLeft') {
        updateBet(-10)
    } else if (event.code === 'ArrowRight') {
        updateBet(10)
    }
});

document.getElementById('roll').addEventListener('click', function() {
    startRoll();
})

document.getElementById('sub-roll').addEventListener('click', function() {
    updateBet(-10)
})

document.getElementById('add-roll').addEventListener('click', function() {
    updateBet(10)
})