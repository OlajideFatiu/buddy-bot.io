document.addEventListener('DOMContentLoaded', () => {
    // 1. Get our robot friends from the webpage
    const microphoneBtn = document.getElementById('microphone-btn');
    const robotFace = document.getElementById('robot-face');
    const robotMouth = document.getElementById('robot-mouth');
    const robotEyes = document.querySelectorAll('.robot-eye');
    const statusTextElement = document.getElementById('status-text');
    const thoughtBubble = document.getElementById('thought-bubble');
    const audioWave = document.querySelector('.audio-wave');

    // IMPORTANT: This is like a secret key for Buddy Bot to talk to a smart brain online.
    // In a real app, a grown-up should keep this key super safe on a server, not directly here!
    const rapidApiHost = 'open-ai21.p.rapidapi.com';
    const rapidApiKey = '42ec9ab66amsh7611ecc999c7e3bp1f3290jsn9c80c28e3f6d';

    // 2. Buddy Bot's Memory: What we talked about before!
    // Buddy Bot remembers up to 10 things we said so it can keep up with our chat.
    const CONVERSATION_MEMORY_LIMIT = 10;
    let conversationHistory = [{
        role: 'system', // This tells the smart brain what kind of friend Buddy Bot is
        content: 'You are Buddy Bot, a friendly, encouraging, and slightly whimsical robot friend designed for kids. Use simple language and always maintain a positive tone. If you are unsure, suggest exploring together. Keep responses concise and engaging.'
    }];

    // 3. Buddy Bot's Fun Sounds!
    // These are little noises Buddy Bot makes to show how it's feeling.
    const sounds = {
        click: new Audio('https://www.soundjay.com/buttons/button-2.mp3'),
        startListen: new Audio('https://www.soundjay.com/misc/sounds/ding-dong-1.mp3'),
        startSpeak: new Audio('https://www.soundjay.com/misc/sounds/blop-1.mp3'),
        error: new Audio('https://www.soundjay.com/misc/sounds/fail-buzzer-02.mp3'),
        welcomeBack: new Audio('https://www.soundjay.com/human-voice/sounds/boy-3.mp3') // A special sound for when you come back!
    };

    // Load all the sounds so they are ready to play right away.
    for (const key in sounds) {
        sounds[key].load();
    }

    // A simple function to play a sound.
    function playSound(name) {
        if (sounds[name]) {
            sounds[name].currentTime = 0; // Start the sound from the beginning
            sounds[name].play().catch(e => console.warn(`Oops! Couldn't play sound ${name}:`, e));
        }
    }

    // 4. Buddy Bot Talks to You (Text-to-Speech)!
    const synth = window.speechSynthesis; // This is the tool that makes the computer talk.
    let voices = []; // This will hold all the different voices the computer can use.
    // Check if you've visited Buddy Bot before using local storage (like a sticky note).
    let initialGreetingSpoken = localStorage.getItem('buddyBotVisited') === 'true';

    // This function finds and loads the voices.
    const loadVoices = () => {
        voices = synth.getVoices();
        if (voices.length === 0 && 'onvoiceschanged' in synth) {
            // If voices aren't ready yet, wait for them to load.
            synth.onvoiceschanged = () => {
                voices = synth.getVoices();
                console.log("Voices ready to go!");
                triggerInitialGreeting();
            };
        } else if (voices.length > 0) {
            // If voices are already there, just use them.
            console.log("Voices loaded already!");
            triggerInitialGreeting();
        }
    };

    // Buddy Bot's first hello!
    function triggerInitialGreeting() {
        if (!initialGreetingSpoken && voices.length > 0) {
            let greetingMessage;
            if (localStorage.getItem('buddyBotVisited')) {
                greetingMessage = "Welcome back, little explorer! What fun are we having today?";
                playSound('welcomeBack');
            } else {
                greetingMessage = "Hi there, little explorer! Tap and hold the microphone button to talk to me!";
                localStorage.setItem('buddyBotVisited', 'true'); // Remember that you visited!
            }
            speakText(greetingMessage);
            initialGreetingSpoken = true;
        }
    }

    // This function makes Buddy Bot say words out loud.
    function speakText(text) {
        if (!('speechSynthesis' in window)) {
            console.warn("Uh oh! Your browser can't talk. Try using Chrome or Edge!");
            setStatusText("Voice output not supported.");
            return;
        }

        if (synth.speaking) {
            synth.cancel(); // Stop Buddy Bot if it's already talking.
        }

        const utterance = new SpeechSynthesisUtterance(text); // Create the words to say.

        // Try to find a nice voice that sounds like a kid's friend.
        const kidVoice = voices.find(voice => voice.name.includes('Google US English') && voice.name.includes('Female')) ||
                         voices.find(voice => voice.name.includes('Google UK English Female')) ||
                         voices.find(voice => voice.lang === 'en-US' && voice.name.includes('Female')) ||
                         voices.find(voice => voice.lang.startsWith('en-') && voice.default);

        if (kidVoice) {
            utterance.voice = kidVoice;
        } else {
            console.warn("Couldn't find a special voice, using the default one.");
        }

        utterance.rate = 1.05; // Make Buddy Bot talk a little faster.
        utterance.pitch = 1.1; // Make Buddy Bot's voice a little higher.

        // What happens when Buddy Bot starts talking:
        utterance.onstart = () => {
            robotMouth.classList.add('talking'); // Mouth moves
            robotFace.classList.add('bouncing', 'active-twitch'); // Face bounces, antennas twitch
            setStatusText("Buddy Bot is talking...");
            playSound('startSpeak');
        };

        // What happens when Buddy Bot finishes talking:
        utterance.onend = () => {
            robotMouth.classList.remove('talking');
            robotFace.classList.remove('bouncing', 'active-twitch');
            if (!isListening && !robotMouth.classList.contains('thinking')) {
                setStatusText("Tap and hold to talk to Buddy Bot!"); // Go back to ready message
                robotEyes.forEach(eye => eye.classList.remove('happy')); // Eyes stop being happy
            }
        };

        // What happens if Buddy Bot has trouble talking:
        utterance.onerror = (event) => {
            console.error('Talking error:', event);
            robotMouth.classList.remove('talking');
            robotFace.classList.remove('bouncing', 'active-twitch');
            setStatusText("Oopsie! Buddy Bot had a little voice glitch.");
            playSound('error');
        };

        synth.speak(utterance); // Make Buddy Bot speak!
    }

    // 5. You Talk to Buddy Bot (Speech-to-Text)!
    let recognition; // This is the tool that listens to your voice.
    let isListening = false; // Is Buddy Bot listening right now?
    let holdTimeout; // A timer to stop listening if you hold the button for too long.

    // Check if your browser can listen to your voice.
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition(); // Create our listening tool.

        recognition.continuous = false; // Listen for one phrase, then stop.
        recognition.interimResults = false; // Only give us the final words, not guesses.
        recognition.lang = 'en-US'; // Listen in US English.

        // What happens when Buddy Bot starts listening:
        recognition.onstart = () => {
            isListening = true;
            microphoneBtn.classList.add('listening', 'active-wave'); // Button pulses, wave shows
            robotEyes.forEach(eye => {
                eye.classList.remove('happy');
                eye.classList.add('listening'); // Eyes look attentive
            });
            robotFace.classList.add('active-twitch'); // Antennas twitch
            setStatusText("Listening for your voice...");
            playSound('startListen');
            if (synth.speaking) {
                synth.cancel(); // Stop Buddy Bot talking if you want to speak.
                robotMouth.classList.remove('talking');
                robotFace.classList.remove('bouncing');
            }
        };

        // What happens when Buddy Bot hears you:
        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript; // Get the words you said.
            setStatusText("Got it! Buddy Bot is thinking...");
            robotEyes.forEach(eye => eye.classList.remove('listening'));
            microphoneBtn.classList.remove('active-wave'); // Stop the wave.
            processVoiceCommand(speechResult); // Send your words to Buddy Bot's brain.
        };

        // What happens if Buddy Bot has trouble hearing you:
        recognition.onerror = (event) => {
            console.error('Voice listening error:', event.error);
            robotEyes.forEach(eye => eye.classList.remove('listening'));
            microphoneBtn.classList.remove('listening', 'active-wave');
            robotFace.classList.remove('active-twitch');

            if (event.error === 'not-allowed') {
                setStatusText("Oh no! Microphone access denied. Please ask a grown-up to help you allow it in your browser settings!");
                speakText("Oh dear! I need to hear you. Could you please ask a grown-up to help me get microphone access?");
            } else if (event.error === 'no-speech') {
                setStatusText("Oops! Didn't hear anything. Try holding the button and speaking a bit louder!");
                speakText("Sorry, I didn't hear you. Could you please try again?");
            } else if (event.error === 'network') {
                setStatusText("Buddy Bot's ears are having network trouble. Check your internet!");
                speakText("My ears are having trouble connecting to the internet. Please check your network!");
            } else {
                setStatusText("Hmm, something went wrong with listening. Let's try again!");
                speakText("Oops! Something went wrong. Can you try again?");
            }
            isListening = false;
        };

        // What happens when Buddy Bot stops listening (after hearing you or an error):
        recognition.onend = () => {
            isListening = false;
            microphoneBtn.classList.remove('listening');
            robotEyes.forEach(eye => eye.classList.remove('listening'));
            microphoneBtn.classList.remove('active-wave');
            robotFace.classList.remove('active-twitch');
        };

    } else {
        // If your browser can't listen at all:
        console.warn("Sorry, your browser doesn't understand voice input.");
        microphoneBtn.style.display = 'none'; // Hide the microphone button.
        setStatusText("Oh dear! Voice input isn't supported here. Please try a different browser like Chrome or Edge.");
    }

    // 6. How to Talk: Hold the button!
    // When you press the button down:
    microphoneBtn.addEventListener('mousedown', startListeningHold);
    microphoneBtn.addEventListener('touchstart', startListeningHold, { passive: true }); // For touch screens

    // When you lift your finger or mouse:
    microphoneBtn.addEventListener('mouseup', stopListeningHold);
    microphoneBtn.addEventListener('mouseleave', stopListeningHold); // If your mouse slips off the button
    microphoneBtn.addEventListener('touchend', stopListeningHold);
    microphoneBtn.addEventListener('touchcancel', stopListeningHold);

    // Function to start listening when you hold the button.
    function startListeningHold() {
        if (synth.speaking) {
            synth.cancel(); // Stop Buddy Bot from talking if you want to speak.
            robotMouth.classList.remove('talking');
            robotFace.classList.remove('bouncing');
        }
        if (!isListening && recognition) { // Only start if not already listening.
            playSound('click');
            try {
                recognition.start(); // Start listening!
                // Set a timer: if you hold for too long, Buddy Bot will stop listening automatically.
                holdTimeout = setTimeout(() => {
                    if (isListening) {
                        recognition.stop();
                        setStatusText("You spoke for a long time! Buddy Bot is thinking...");
                    }
                }, 10000); // Stop after 10 seconds.
            } catch (e) {
                console.error("Error starting voice listening:", e);
                speakText("Uh oh! I can't start listening. Please check your microphone permissions.");
                setStatusText("Microphone error!");
                playSound('error');
            }
        }
    }

    // Function to stop listening when you let go of the button.
    function stopListeningHold() {
        clearTimeout(holdTimeout); // Cancel the "too long" timer.
        if (isListening && recognition) {
            recognition.stop(); // Stop listening!
        }
    }

    // 7. Show messages on the screen with a "typing" animation.
    function setStatusText(message, isTyping = false) {
        if (isTyping) {
            statusTextElement.innerHTML = `${message} <span class="typing">.<span>.<span>.</span>`;
            statusTextElement.classList.add('typing');
        } else {
            statusTextElement.textContent = message;
            statusTextElement.classList.remove('typing');
        }
    }

    // 8. The Main Brain: How Buddy Bot answers your questions!
    async function processVoiceCommand(command) {
        // Add what you said to Buddy Bot's memory.
        conversationHistory.push({ role: 'user', content: command });

        // Make sure Buddy Bot's memory doesn't get too full.
        if (conversationHistory.length > CONVERSATION_MEMORY_LIMIT) {
            conversationHistory = conversationHistory.slice(conversationHistory.length - CONVERSATION_MEMORY_LIMIT);
        }

        setStatusText("Buddy Bot is thinking", true); // Show "thinking" with typing dots.
        robotMouth.classList.add('thinking'); // Mouth looks like it's thinking.
        robotFace.classList.add('swaying'); // Face sways.
        thoughtBubble.classList.add('active'); // Thought bubble pops up.

        try {
            // Ask the smart brain online for an answer!
            const response = await fetch('https://open-ai21.p.rapidapi.com/conversationllama', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-rapidapi-host': rapidApiHost,
                    'x-rapidapi-key': rapidApiKey
                },
                body: JSON.stringify({
                    messages: conversationHistory, // Send the conversation history.
                    web_access: false // Don't let it search the web for now.
                })
            });

            // After getting an answer, remove thinking animations.
            robotMouth.classList.remove('thinking');
            robotFace.classList.remove('swaying');
            thoughtBubble.classList.remove('active');
            setStatusText("Got a response!", false); // Remove typing dots.

            // If there was a problem getting the answer:
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                let errorMessage = `HTTP error! Status: ${response.status}.`;
                if (response.status === 401) {
                    errorMessage += " It looks like Buddy Bot's secret key is wrong or not allowed.";
                } else if (response.status === 429) {
                    errorMessage += " Too many questions! Please wait a moment before trying again.";
                } else if (errorData.message) {
                    errorMessage += ` The smart brain says: ${errorData.message}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const botResponse = data.result || "Hmm, Buddy Bot is thinking... Can you try asking me something else?";

            // Add Buddy Bot's answer to the memory.
            conversationHistory.push({ role: 'assistant', content: botResponse });

            robotEyes.forEach(eye => eye.classList.add('happy')); // Make eyes look happy!
            setTimeout(() => {
                robotEyes.forEach(eye => eye.classList.remove('happy'));
            }, 1500); // Happy eyes disappear after a bit.

            speakText(botResponse); // Make Buddy Bot say the answer.

        } catch (error) {
            // If anything goes wrong while talking to the smart brain:
            console.error('Error talking to the smart brain:', error);
            robotMouth.classList.remove('thinking');
            robotFace.classList.remove('swaying');
            thoughtBubble.classList.remove('active');
            playSound('error');

            if (error.message.includes('Failed to fetch')) {
                speakText('Oops! Buddy Bot can\'t connect to the internet right now. Check your connection!');
                setStatusText("No internet!");
            } else if (error.message.includes('API key is incorrect')) {
                speakText('Buddy Bot needs its brain reconnected! There\'s an issue with the secret key setup.');
                setStatusText("Secret key error!");
            } else if (error.message.includes('Too many requests')) {
                speakText('Whoa, too many questions! Buddy Bot needs a short break.');
                setStatusText("Too many questions!");
            } else {
                speakText('Oh dear! Buddy Bot needs a little break. Try again in a moment!');
                setStatusText("Brain error!");
            }
        }
    }

    // 9. Fun Idle Animations for Buddy Bot!
    let idleAnimationInterval;
    let pupilInterval;

    function startIdleAnimations() {
        idleAnimationInterval = setInterval(() => {
            // Sometimes, Buddy Bot's antennas wiggle when it's idle.
            if (Math.random() < 0.3 && !robotFace.classList.contains('swaying') && !robotFace.classList.contains('bouncing')) {
                robotFace.classList.add('idle-wiggle');
                setTimeout(() => {
                    robotFace.classList.remove('idle-wiggle');
                }, 500);
            }
        }, 5000); // Check every 5 seconds.

        // Buddy Bot's eyes follow your mouse!
        const eyeContainers = document.querySelectorAll('.robot-eye');
        document.body.addEventListener('mousemove', (e) => {
            eyeContainers.forEach(eye => {
                const eyeRect = eye.getBoundingClientRect(); // Get eye's position.
                const eyeCenterX = eyeRect.left + eyeRect.width / 2;
                const eyeCenterY = eyeRect.top + eyeRect.height / 2;

                // Calculate where the mouse is relative to the eye.
                const angle = Math.atan2(e.clientY - eyeCenterY, e.clientX - eyeCenterX);
                const distance = Math.min(eyeRect.width / 4, Math.sqrt(Math.pow(e.clientX - eyeCenterX, 2) + Math.pow(e.clientY - eyeCenterY, 2)));

                const pupilX = Math.cos(angle) * distance;
                const pupilY = Math.sin(angle) * distance;

                // Move the pupils!
                if (eye.classList.contains('left')) {
                    eye.style.setProperty('--pupil-x-left', `${pupilX}px`);
                } else {
                    eye.style.setProperty('--pupil-x-right', `${pupilX}px`);
                }
                eye.style.setProperty('--pupil-y', `${pupilY}px`);
            });
        });

        // If your mouse isn't moving, Buddy Bot's eyes might dart around a bit.
        let lastMouseMoveTime = Date.now();
        document.body.addEventListener('mousemove', () => {
            lastMouseMoveTime = Date.now(); // Reset timer when mouse moves.
        });

        pupilInterval = setInterval(() => {
            if (Date.now() - lastMouseMoveTime > 5000) { // If mouse idle for 5 seconds.
                eyeContainers.forEach(eye => {
                    // Randomly move pupils.
                    const randomX = (Math.random() - 0.5) * (eye.offsetWidth / 3);
                    const randomY = (Math.random() - 0.5) * (eye.offsetHeight / 3);

                    if (eye.classList.contains('left')) {
                        eye.style.setProperty('--pupil-x-left', `${randomX}px`);
                    } else {
                        eye.style.setProperty('--pupil-x-right', `${randomX}px`);
                    }
                    eye.style.setProperty('--pupil-y', `${randomY}px`);
                });
            }
        }, 1000); // Check every second.
    }

    // 10. Start everything when the page loads!
    loadVoices(); // Get voices ready for Buddy Bot to talk.
    startIdleAnimations(); // Start the fun wiggles and eye movements.
    setStatusText("Tap and hold to talk to Buddy Bot!"); // Tell you what to do.
});