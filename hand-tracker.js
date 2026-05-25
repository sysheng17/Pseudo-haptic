let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

// 全域共享的手勢資料狀態
let handData = {
    hasHand: false,
    indexPad: { x: 0, y: 0, z: 0 },   // 食指指腹中心
    thumbPad: { x: 0, y: 0, z: 0 },   // 大拇指指腹中心
    isPinching: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handData.hasHand = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 映射NDC (-1 ~ 1)，使用關節處作為指腹肉墊錨點 (7, 3) 提高穩定度
        handData.indexPad.x = (1 - landmarks[7].x) * 2 - 1;
        handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
        handData.indexPad.z = landmarks[7].z;

        handData.thumbPad.x = (1 - landmarks[3].x) * 2 - 1;
        handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;
        handData.thumbPad.z = landmarks[3].z;

        // 計算螢幕上的 2D 距離
        const dist2D = Math.sqrt(
            Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
            Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
        );

        // 手機端捏合判定距離稍微加大到 0.2
        if (dist2D < 0.20) {
            handData.isPinching = true;
            handData.pinchCenterNDC.x = (handData.indexPad.x + handData.thumbPad.x) / 2;
            handData.pinchCenterNDC.y = (handData.indexPad.y + handData.thumbPad.y) / 2;
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
    modelComplexity: 0, // 手機端加快運算
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});
hands.onResults(onHandResults);

// ✨核心修正：限制視訊解析度為 640x480，提高手機 FPS ✨
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});
camera.start();