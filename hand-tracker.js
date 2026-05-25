let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

// 全域共享的手勢資料狀態
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
        
        // 映射至 2D 歸一化裝置座標系 (-1 ~ 1)
        handData.indexTip.x = (1 - landmarks[8].x) * 2 - 1;
        handData.indexTip.y = (1 - landmarks[8].y) * 2 - 1;
        handData.indexTip.z = landmarks[8].z;

        handData.thumbTip.x = (1 - landmarks[4].x) * 2 - 1;
        handData.thumbTip.y = (1 - landmarks[4].y) * 2 - 1;
        handData.thumbTip.z = landmarks[4].z;

        // 計算食指與大拇指尖的距離
        const dist = Math.sqrt(
            Math.pow(handData.indexTip.x - handData.thumbTip.x, 2) +
            Math.pow(handData.indexTip.y - handData.thumbTip.y, 2)
        );

        // 兩指距離小於閾值判定為「捏合準備抓取」
        if (dist < 0.16) {
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
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});
hands.onResults(onHandResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: window.innerWidth,
    height: window.innerHeight
});
camera.start();