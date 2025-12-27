// setup.js - Camera permission request logic
const video = document.getElementById('test-video');
const placeholder = document.getElementById('placeholder');
const btn = document.getElementById('grant-btn');

btn.onclick = async () => {
    try {
        btn.innerText = "Requesting...";
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.style.display = 'block';
        placeholder.style.display = 'none';

        btn.innerText = "Success! Closing in 2s...";
        btn.style.background = "#10b981";

        setTimeout(() => {
            stream.getTracks().forEach(t => t.stop());
            window.close();
        }, 2000);
    } catch (e) {
        console.error(e);
        alert("Could not access camera: " + e.message + "\n\nPlease check if your camera is blocked in browser settings.");
        btn.innerText = "Try Again";
    }
};
