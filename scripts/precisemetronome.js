        // --- Theme Logic ---
        const themeToggle = document.getElementById('theme-toggle');
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });

        // --- Core Audio Logic ---
        let audioContext = null;
        let masterGain = null;
        let isRunning = false;
        let nextNoteTime = 0.0;     
        let timerID = null;         
        let bpm = 120;
        let lookahead = 25.0;       
        let scheduleAheadTime = 0.1; 
        let currentSubdivision = 0;
        let subdivisionCount = 1;
        let currentBeat = 0;
        let beatsPerMeasure = 4;

        let tunerActive = false;
        let tunerStream = null;
        let analyser = null;
        let tunerUpdateId = null;
        let useSharps = false; 
        let calibrationPitch = 440;
        let transpositionInterval = 0;
        
        let smoothedFreq = 0;
        const smoothingFactor = 0.15;
        let frequencyHistory = [];
        const historyLength = 5;

        const bpmInputs = document.querySelectorAll('.bpm-sync');
        const bpmSlider = document.getElementById('bpm-slider');
        const visualizer = document.getElementById('visualizer');
        const timeSigSelect = document.getElementById('time-sig');
        const subdivisionSelect = document.getElementById('subdivision');
        const tunerNote = document.getElementById('tuner-note');
        const tunerFreq = document.getElementById('tuner-freq');
        const tunerNeedle = document.getElementById('tuner-needle');
        const tunerStatus = document.getElementById('tuner-status');
        const btnFlats = document.getElementById('toggle-flats');
        const btnSharps = document.getElementById('toggle-sharps');
        const transpositionSelect = document.getElementById('transposition');
        const metroButtons = document.querySelectorAll('.metro-toggle');
        const tunerMetroBtn = document.getElementById('start-stop-tuner');
        const calibInput = document.getElementById('calib-input');

        function initAudio() {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                masterGain = audioContext.createGain();
                masterGain.gain.value = 1.5; 
                masterGain.connect(audioContext.destination);
            }
            if (audioContext.state === 'suspended') audioContext.resume();
        }

        function updateBPM(newBPM) {
            let value = parseInt(newBPM);
            if (isNaN(value)) { bpmInputs.forEach(i => i.value = bpm); return; }
            value = Math.min(Math.max(value, 40), 240);
            bpm = value;
            bpmSlider.value = value;
            bpmInputs.forEach(input => input.value = value);
        }

        function nextNote() {
            const secondsPerBeat = 60.0 / bpm;
            nextNoteTime += secondsPerBeat / subdivisionCount;
            currentSubdivision++;
            if (currentSubdivision >= subdivisionCount) {
                currentSubdivision = 0;
                currentBeat = (currentBeat + 1) % beatsPerMeasure;
            }
        }

        function scheduleNote(beatNumber, subNumber, time) {
            const osc = audioContext.createOscillator();
            const envelope = audioContext.createGain();
            osc.type = 'sine';
            const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.05, audioContext.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseBuffer.length; i++) output[i] = Math.random() * 2 - 1;
            const noise = audioContext.createBufferSource();
            noise.buffer = noiseBuffer;
            const noiseFilter = audioContext.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.value = 1000; 
            const noiseEnvelope = audioContext.createGain();

            if (subNumber === 0) {
                if (beatNumber === 0) {
                    osc.frequency.value = 1000;
                    envelope.gain.setValueAtTime(0, time);
                    envelope.gain.linearRampToValueAtTime(0.7, time + 0.002);
                    noiseEnvelope.gain.setValueAtTime(1.8, time); 
                } else {
                    osc.frequency.value = 440;
                    envelope.gain.setValueAtTime(0, time);
                    envelope.gain.linearRampToValueAtTime(1, time + 0.002);
                    noiseEnvelope.gain.setValueAtTime(1.5, time); 
                }
            } else {
                osc.frequency.value = 180;
                envelope.gain.setValueAtTime(0, time);
                envelope.gain.linearRampToValueAtTime(0.3, time + 0.002);
                noiseEnvelope.gain.setValueAtTime(0.6, time); 
            }
            
            const decay = subNumber === 0 ? 0.1 : 0.04;
            envelope.gain.exponentialRampToValueAtTime(0.001, time + decay);
            noiseEnvelope.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
            osc.connect(envelope); envelope.connect(masterGain);
            noise.connect(noiseFilter); noiseFilter.connect(noiseEnvelope); noiseEnvelope.connect(masterGain);
            osc.start(time); osc.stop(time + decay);
            noise.start(time); noise.stop(time + 0.05);
            const delay = (time - audioContext.currentTime) * 1000;
            setTimeout(() => highlightBeat(beatNumber, subNumber), delay);
        }

        function scheduler() {
            while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
                scheduleNote(currentBeat, currentSubdivision, nextNoteTime);
                nextNote();
            }
            timerID = setTimeout(scheduler, lookahead);
        }

        function highlightBeat(beatIndex, subIndex) {
            const dots = visualizer.querySelectorAll('.visualizer-dot');
            dots.forEach((dot, idx) => {
                dot.classList.remove('active-beat', 'active-accent', 'active-subdivision');
                if (idx === beatIndex) {
                    if (subIndex === 0) dot.classList.add(idx === 0 ? 'active-accent' : 'active-beat');
                    else dot.classList.add('active-subdivision');
                }
            });
            if (subIndex === 0) {
                tunerMetroBtn.classList.remove('flash-beat', 'flash-accent');
                void tunerMetroBtn.offsetWidth; 
                tunerMetroBtn.classList.add(beatIndex === 0 ? 'flash-accent' : 'flash-beat');
            }
        }

        function createVisualizer() {
            visualizer.innerHTML = '';
            for (let i = 0; i < beatsPerMeasure; i++) {
                const dot = document.createElement('div');
                dot.className = 'visualizer-dot w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700';
                visualizer.appendChild(dot);
            }
        }

        const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        
        async function startTuner() {
            initAudio();
            try {
                tunerStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
                const source = audioContext.createMediaStreamSource(tunerStream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                source.connect(analyser);
                tunerActive = true;
                tunerStatus.textContent = 'Listening...';
                tunerStatus.classList.remove('text-slate-400', 'text-rose-500');
                tunerStatus.classList.add('text-sky-500');
                smoothedFreq = 0; frequencyHistory = [];
                updateTuner();
            } catch (err) {
                tunerStatus.textContent = "Mic Access Denied";
                tunerStatus.classList.remove('text-slate-400', 'text-sky-500');
                tunerStatus.classList.add('text-rose-500');
            }
        }

        function stopTuner() {
            tunerActive = false;
            if (tunerUpdateId) cancelAnimationFrame(tunerUpdateId);
            if (tunerStream) {
                tunerStream.getTracks().forEach(track => track.stop());
                tunerStream = null;
            }
            tunerStatus.textContent = 'Tuner Idle';
            tunerStatus.classList.remove('text-sky-500', 'text-rose-500');
            tunerStatus.classList.add('text-slate-400');
            tunerNote.textContent = '--'; tunerFreq.textContent = '0.00 Hz';
            tunerNeedle.style.transform = 'rotate(0deg)';
        }

        function autoCorrelate(buf, sampleRate) {
            let SIZE = buf.length;
            let rms = 0;
            for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
            rms = Math.sqrt(rms / SIZE);
            if (rms < 0.01) return -1; 
            let r1 = 0, r2 = SIZE - 1, thres = 0.2;
            for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
            for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
            buf = buf.slice(r1, r2); SIZE = buf.length;
            let c = new Float32Array(SIZE).fill(0);
            for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
            let d = 0; while (c[d] > c[d + 1]) d++;
            let maxval = -1, maxpos = -1;
            for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
            let T0 = maxpos;
            let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
            let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2;
            if (a) T0 = T0 - b / (2 * a);
            return sampleRate / T0;
        }

        function updateTuner() {
            if (!tunerActive || !analyser) return;
            const buffer = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(buffer);
            const freq = autoCorrelate(buffer, audioContext.sampleRate);
            if (freq !== -1 && freq > 20 && freq < 2000) {
                frequencyHistory.push(freq);
                if (frequencyHistory.length > historyLength) frequencyHistory.shift();
                const avgFreq = frequencyHistory.reduce((a, b) => a + b) / frequencyHistory.length;
                if (smoothedFreq === 0) smoothedFreq = avgFreq;
                else smoothedFreq = smoothedFreq + smoothingFactor * (avgFreq - smoothedFreq);
                const currentCalib = calibrationPitch > 0 ? calibrationPitch : 440;
                const noteNum = 12 * (Math.log(smoothedFreq / currentCalib) / Math.log(2)) + 69;
                const transposedNoteNum = noteNum + transpositionInterval;
                const roundedNote = Math.round(transposedNoteNum);
                const cents = Math.floor((transposedNoteNum - roundedNote) * 100);
                const noteName = useSharps ? SHARP_NOTES[roundedNote % 12] : FLAT_NOTES[roundedNote % 12];
                tunerNote.textContent = noteName;
                tunerFreq.textContent = smoothedFreq.toFixed(2) + " Hz";
                const degree = Math.min(Math.max(cents, -50), 50);
                tunerNeedle.style.transform = `rotate(${degree}deg)`;
            }
            tunerUpdateId = requestAnimationFrame(updateTuner);
        }

        function toggleMetronome() {
            initAudio();
            isRunning = !isRunning;
            if (isRunning) {
                currentBeat = 0; currentSubdivision = 0;
                nextNoteTime = audioContext.currentTime + 0.05;
                scheduler();
                updateMetroUI(true);
            } else {
                clearTimeout(timerID);
                updateMetroUI(false);
            }
        }

        function updateMetroUI(playing) {
            metroButtons.forEach(btn => {
                btn.classList.remove('flash-beat', 'flash-accent');
                if (playing) {
                    btn.textContent = 'Stop Metronome';
                    btn.classList.replace('bg-sky-500', 'bg-rose-500');
                    btn.classList.replace('bg-slate-200', 'bg-rose-500/80');
                    btn.classList.replace('dark:bg-slate-700', 'dark:bg-rose-500/80');
                } else {
                    btn.textContent = btn.id === 'start-stop' ? 'Start' : 'Start Metronome';
                    btn.classList.replace('bg-rose-500', 'bg-sky-500');
                    btn.classList.replace('bg-rose-500/80', 'bg-slate-200');
                    btn.classList.replace('dark:bg-rose-500/80', 'dark:bg-slate-700');
                }
            });
        }

        // --- Event Listeners ---
        metroButtons.forEach(btn => btn.addEventListener('click', toggleMetronome));
        bpmSlider.addEventListener('input', (e) => updateBPM(e.target.value));
        bpmInputs.forEach(i => i.addEventListener('change', (e) => updateBPM(e.target.value)));
        document.getElementById('plus-btn').addEventListener('click', () => updateBPM(bpm + 1));
        document.getElementById('minus-btn').addEventListener('click', () => updateBPM(bpm - 1));
        document.getElementById('calib-plus').addEventListener('click', () => { calibrationPitch++; calibInput.value = calibrationPitch; });
        document.getElementById('calib-minus').addEventListener('click', () => { calibrationPitch--; calibInput.value = calibrationPitch; });
        transpositionSelect.addEventListener('change', (e) => transpositionInterval = parseInt(e.target.value));

        btnFlats.addEventListener('click', () => {
            useSharps = false;
            btnFlats.classList.add('bg-sky-500', 'text-slate-900');
            btnFlats.classList.remove('text-slate-400', 'dark:text-slate-500');
            btnSharps.classList.remove('bg-sky-500', 'text-slate-900');
            btnSharps.classList.add('text-slate-400', 'dark:text-slate-500');
        });

        btnSharps.addEventListener('click', () => {
            useSharps = true;
            btnSharps.classList.add('bg-sky-500', 'text-slate-900');
            btnSharps.classList.remove('text-slate-400', 'dark:text-slate-500');
            btnFlats.classList.remove('bg-sky-500', 'text-slate-900');
            btnFlats.classList.add('text-slate-400', 'dark:text-slate-500');
        });

        document.getElementById('tab-metronome').addEventListener('click', function() {
            this.classList.add('tab-active'); this.classList.remove('text-slate-400', 'dark:text-slate-500');
            document.getElementById('tab-tuner').classList.remove('tab-active');
            document.getElementById('tab-tuner').classList.add('text-slate-400', 'dark:text-slate-500');
            document.getElementById('section-metronome').classList.remove('hidden');
            document.getElementById('section-tuner').classList.add('hidden');
            stopTuner();
        });

        document.getElementById('tab-tuner').addEventListener('click', function() {
            this.classList.add('tab-active'); this.classList.remove('text-slate-400', 'dark:text-slate-500');
            document.getElementById('tab-metronome').classList.remove('tab-active');
            document.getElementById('tab-metronome').classList.add('text-slate-400', 'dark:text-slate-500');
            document.getElementById('section-tuner').classList.remove('hidden');
            document.getElementById('section-metronome').classList.add('hidden');
            startTuner();
        });

        timeSigSelect.addEventListener('change', (e) => { beatsPerMeasure = parseInt(e.target.value); createVisualizer(); });
        subdivisionSelect.addEventListener('change', (e) => subdivisionCount = parseInt(e.target.value));

        createVisualizer();
