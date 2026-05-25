let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

let handData = {
    hasHand: false,
    indexTip: { x: 0, y: 0, z: 0 },
    thumbTip: { x: 0, y: 0, z: 0 },
    isPinching: false,
    pinchCenter: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handData.hasHand = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 精準歸一化映射
        handData.indexTip.x = (1 - landmarks[8].x) * 2 - 1;
        handData.indexTip.y = (1 - landmarks[8].y) * 2 - 1;
        handData.indexTip.z = landmarks[8].z;

        handData.thumbTip.x = (1 - landmarks[4].x) * 2 - 1;
        handData.thumbTip.y = (1 - landmarks[4].y) * 2 - 1;
        handData.thumbTip.z = landmarks[4].z;

        const dist = Math.sqrt(
            Math.pow(handData.indexTip.x - handData.thumbTip.x, 2) +
            Math.pow(handData.indexTip.y - handData.thumbTip.y, 2)
        );

        // 手機螢幕較小，微調捏合判定敏感度
        if (dist < 0.20) {
            handData.isPinching = true;
            handData.pinchCenter.x = (handData.indexTip.x + handData.thumbTip.x) / 2;
            handData.pinchCenter.y = (handData.indexTip.y + handData.thumbTip.y) / 2;
            handData.pinchCenter.z = (handData.indexTip.z + handData.thumbTip.z) / 2;
        } else {
            handData.isPinching = false;
        }
    } else {
        handData.hasHand = false;
        handData.isPinching = false;
    }
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0, // 手機端設為 0 加快運算，降低發熱
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onHandResults);

// 行動端優化：使用動態寬高，不寫死解析度
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: { ideal: 640 },
    height: { ideal: 480 }
});
camera.start();