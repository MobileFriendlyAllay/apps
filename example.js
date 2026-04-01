/**
 * CLOCK & DATE LOGIC
 */
function updateDisplay() {
    const now = new Date();
    
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'ᴘᴍ' : 'ᴀᴍ';
    
    hours = hours % 12;
    hours = hours ? hours : 12;
    
    const timeElement = document.getElementById('time');
    if (timeElement) {
        timeElement.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
    }
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateElement = document.getElementById('date');
    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString(undefined, options);
    }
}

/**
 * BATTERY LOGIC
 */
async function updateBattery() {
    if (!navigator.getBattery) return;

    try {
        const battery = await navigator.getBattery();
        const updateBatteryUI = () => {
            const level = Math.round(battery.level * 100);
            const isCharging = battery.charging;

            document.getElementById('battery-percent').textContent = `${level}%`;
            document.getElementById('battery-level').style.width = `${level}%`;
            document.getElementById('charging-bolt').style.display = isCharging ? 'block' : 'none';

            const levelBar = document.getElementById('battery-level');
            if (level <= 20 && !isCharging) {
                levelBar.style.backgroundColor = '#ef4444';
            } else {
                levelBar.style.backgroundColor = '#10b981';
            }
        };

        updateBatteryUI();
        battery.addEventListener('levelchange', updateBatteryUI);
        battery.addEventListener('chargingchange', updateBatteryUI);
    } catch (e) {
        console.error("Battery API failed", e);
    }
}

/**
 * ANIMATED BACKGROUND LOGIC
 */
const canvas = document.getElementById('background-canvas');
const ctx = canvas.getContext('2d');
let circles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

class Circle {
    constructor() {
        this.size = Math.random() * (100 - 10) + 10; // Size between 10 and 100
        this.radius = this.size / 2;
        
        // Start just off-screen to the left
        this.x = -this.radius;
        this.y = Math.random() * canvas.height;
        
        // Opacity logic: size 10 -> 0.5 opacity, size 100 -> 0.1 opacity
        this.opacity = 0.5 - ((this.size - 10) / 90) * 0.4;
        
        // Direction between 45 and 135 degrees
        // 90 is straight right, 45 is up-right, 135 is down-right
        const degrees = Math.random() * (135 - 45) + 45;
        const radians = (degrees - 90) * (Math.PI / 180); 
        
        // Speed logic: Bigger moves quicker
        const baseSpeed = this.size / 20; 
        this.vx = Math.cos(radians) * baseSpeed;
        this.vy = Math.sin(radians) * baseSpeed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        // Using light blue: rgba(186, 230, 253, opacity)
        ctx.fillStyle = `rgba(0, 128, 255, ${this.opacity})`;
        ctx.fill();
    }

    isOffScreen() {
        return (
            this.x - this.radius > canvas.width || 
            this.y + this.radius < -this.radius || 
            this.y - this.radius > canvas.height + this.radius
        );
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Occasionally spawn a new circle
    if (Math.random() < 0.02) {
        circles.push(new Circle());
    }

    for (let i = circles.length - 1; i >= 0; i--) {
        circles[i].update();
        circles[i].draw();

        // Destroy if off-screen
        if (circles[i].isOffScreen()) {
            circles.splice(i, 1);
        }
    }

    requestAnimationFrame(animate);
}

/**
 * INITIALIZATION
 */
window.addEventListener('resize', resizeCanvas);

document.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    updateDisplay();
    updateBattery();
    animate();
    setInterval(updateDisplay, 1000);
});
