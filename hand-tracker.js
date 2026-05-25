let videoElement = document.getElementById('webcam');
let statusElement = document.getElementById('status');

// 全域共享的手勢資料狀態
let handData = {
    hasHand: false,
    indexPad: { x: 0, y: 0, z: 0 },   // 【修復 1】從 Tip 換成 Pad 指腹中心 (更精準的接觸點)
    thumbPad: { x: 0, y: 0, z: 0 },   
    isPinching: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 }
};

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handData.hasHand = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 映射至 2D 歸一化裝置座標系 (-1 ~ 1) NDC
        // 【核心修正】捨棄 Tip (8, 4)，改用接近肉墊的關節 (7, 3)
        // 1. 食指指腹肉墊附近 (節點 7)
        handData.indexPad.x = (1 - landmarks[7].x) * 2 - 1;
        handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
        handData.indexPad.z = landmarks[7].z;

        // 2. 大拇指指腹肉墊附近 (節點 3)
        handData.thumbPad.x = (1 - landmarks[3].x) * 2 - 1;
        handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;
        handData.thumbPad.z = landmarks[3].z;

        // 計算兩指在螢幕上的 2D 距離
        const dist2D = Math.sqrt(
            Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
            Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
        );

        // 判定為捏合 (AR 手機端稍微調低門檻 0.18，因為指腹接觸距離較近)
        if (dist2D < 0.18) {
            handData.isPinching = true;
            handData.pinchCenterNDC.x = (handData.indexPad.x + handData.thumbPad.x) / 2;
            handData.pinchCenterNDC.y = (handData.indexPad.y + handData.thumbPad.y) / 2;
            handData.pinchCenterNDC.z = (handData.indexPad.z + handData.thumbPad.z) / 2;
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
    modelComplexity: 0, 
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});
hands.onResults(onHandResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: { ideal: 640 },
    height: { ideal: 480 }
});
camera.start();