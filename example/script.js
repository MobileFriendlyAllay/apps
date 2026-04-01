/**
 * Example Program Script
 * This file handles logic and audio playback
 */

document.addEventListener('DOMContentLoaded', () => {
    const greetingElement = document.getElementById('greeting');
    const actionButton = document.getElementById('action-btn');
    const successSound = document.getElementById('success-sound');

    // Set the Hello World text
    greetingElement.textContent = "Hello World!";

    // Action when button is clicked
    actionButton.addEventListener('click', () => {
        // 1. Change text color to green to indicate success
        greetingElement.style.color = '#28a745'; 
        
        // 2. Play the success.wav file
        // Resetting currentTime to 0 allows the sound to restart 
        // if the button is clicked multiple times in a row.
        successSound.currentTime = 0;
        
        // We use a Promise-based play call to handle modern browser 
        // requirements for user-interacted audio.
        const playPromise = successSound.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Sound started successfully
                console.log("Audio playing successfully.");
            }).catch(error => {
                // This usually happens if the file 'success.wav' is missing 
                // or if the browser blocks the audio.
                console.error("Playback failed:", error);
            });
        }

        // Removed the alert() prompt so the experience is seamless and non-interruptive.
        console.log("Button clicked: Sound triggered and UI updated.");
    });
});
