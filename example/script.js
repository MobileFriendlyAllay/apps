/**
 * Example Program Script
 * This file is linked from index.html
 */

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const greetingElement = document.getElementById('greeting');
    const actionButton = document.getElementById('action-btn');

    // Set the Hello World text
    greetingElement.textContent = "Hello World!";

    // Add a simple interaction
    actionButton.addEventListener('click', () => {
        greetingElement.style.color = 'blue';
        console.log("The button was clicked! File linking is working correctly.");
        alert("Success! JavaScript file is linked.");
    });
});
