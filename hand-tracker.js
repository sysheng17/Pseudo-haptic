let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

let handData = {
    hasHand: false,
    indexTip: { x: 0, y: 0, z: 0 },   // 食指尖 (史萊姆依附錨點)
    thumbTip: { x: 0, y: 0, z: 0 },   // 大拇指尖 (用來捏拉史萊姆)
    isPinching: false,                // 是否兩指捏合
    pinchCenter: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handData.hasHand = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 映射至 2D 歸一化裝置座標系 (-1 ~ 1) NDC
        // 1. 食指尖 (節點 8)
        handData.indexTip.x = (1 - landmarks[8].x) * 2 - 1;
        handData.indexTip.y = (1 - landmarks[8].y) * 2 - 1;
        handData.indexTip.z = landmarks[8].z;

        // 2. 大拇指尖 (節點 4)
        handData.thumbTip.x = (1 - landmarks[4].x) * 2 - 1;
        handData.thumbTip.y = (1 - landmarks[4].y) * 2 - 1;
        handData.thumbTip.z = landmarks[4].z;

        // 計算兩指在螢幕上的 2D 距離
        const dist = Math.sqrt(
            Math.pow(handData.indexTip.x - handData.thumbTip.x, 2) +
            Math.pow(handData.indexTip.y - handData.thumbTip.y, 2)
        );

        // 兩指距離小於閾值判定為捏合 (AR 手機端稍微調高敏感度 0.22)
        if (dist < 0.22) {
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
    modelComplexity: 0, // 手機端加快運算，降低發熱
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});
hands.onResults(onHandResults);

// 使用動態寬高，不寫死解析度
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: { ideal: 640 },
    height: { ideal: 480 }
});
camera.start();