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
        // 1. Change text color
        greetingElement.style.color = '#28a745'; // Green for success
        
        // 2. Play the success.wav file
        // We reset the time to 0 in case the button is clicked rapidly
        successSound.currentTime = 0;
        successSound.play().catch(error => {
            console.log("Audio playback failed. Ensure 'success.wav' exists in the folder.");
        });

        console.log("Button clicked: Sound triggered and UI updated.");
    });
});
