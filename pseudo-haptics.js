// ==========================================
// 材質與座標除錯版 pseudo-haptics.js (修正一片黑無紫球問題)
// ==========================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');
const videoElement = document.getElementById('webcam');

let scene, camera3D, renderer, slimeMesh, originalPositions;
let handsAI;
let isGrabbed = false; 

// 全域手勢資料
let handData = {
    hasHand: false,
    indexPad: { x: 0, y: 0, z: 0 },
    thumbPad: { x: 0, y: 0, z: 0 },
    isPinching: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 }
};

// 1. 第一步：先初始化 3D 引擎，強制把畫面塗黑，確保看得到畫布
function initThreeEngine() {
    try {
        scene = new THREE.Scene();
        // 強制深藍黑色背景，確認 3D 畫布確實充滿全螢幕
        scene.background = new THREE.Color(0x0f172a); 

        // 調整相機 FOV 廣角適配手機 (65)
        camera3D = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5); // 稍微拉遠相機視距，增加容錯空間

        // 初始化渲染器 (關閉透明背景，確保畫布顯色)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 強制讓畫布貼在最上層
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '999';
        canvas.style.objectFit = 'contain';

        // 加入光源 (加強亮度)
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        // 史萊姆幾何體 (稍為放大 0.7，提高除錯性)
        const geometry = new THREE.SphereGeometry(0.7, 32, 32); 
        originalPositions = geometry.attributes.position.clone();
        
        // 【核心修正 A】材質除錯：關閉紫色與透明，換成不透明的亮綠色「線框模式」
        // 如果球存在，線框 100% 顯現！
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,        // 亮綠色
            wireframe: true,        // ✨ 開啟線框模式，除錯首選
            wireframeLinewidth: 2
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        // 【核心修正 B】座標死鎖在中央 (0, 0, 0)
        slimeMesh.position.set(0, 0, 0); 
        scene.add(slimeMesh);

        console.log("【第一階段】3D 引擎與線框球成功執行。FOV: 65, FOV: 65");
        
        // 3D 成功後，才啟動第二階段：載入 AI 與鏡頭
        initMediaPipeAI();
        animateLoop(); // 立即開始渲染迴圈
        
    } catch (error) {
        statusElement.innerText = "❌ Three.js 錯誤: " + error.message;
    }
}

// 2. 第二步：3D 好了才載入 MediaPipe AI
function initMediaPipeAI() {
    statusElement.innerText = "🤖 AI 模組載入中...";
    try {
        handsAI = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsAI.setOptions({
            maxNumHands: 1,
            modelComplexity: 0, // 手機端輕量化，降低發熱與卡頓
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        handsAI.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                handData.hasHand = true;
                const landmarks = results.multiHandLandmarks[0];
                
                // 映射 NDC (-1 ~ 1)
                handData.indexPad.x = (1 - landmarks[7].x) * 2 - 1;
                handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
                handData.indexPad.z = landmarks[7].z;

                handData.thumbPad.x = (1 - landmarks[3].x) * 2 - 1;
                handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;
                handData.thumbPad.z = landmarks[3].z;

                // 2D 距離判定捏合
                const dist2D = Math.sqrt(
                    Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
                    Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
                );

                // AR 行動端判定距離大一點 (0.22)
                if (dist2D < 0.22) {
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
        });

        startCameraStream();
    } catch (e) {
        statusElement.innerText = "❌ AI 模組載入失敗";
    }
}

// 3. 第三步：開啟鏡頭
async function startCameraStream() {
    statusElement.innerText = "📷 正在喚醒前置相機...";
    try {
        const constraints = {
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            statusElement.innerText = "🔍 鏡頭已開啟，尋找右手指腹...";
            statusElement.style.color = "#eab308";
        };
    } catch (err) {
        statusElement.innerText = "❌ 相機啟動失敗: " + err.message;
    }
}

// 4. 座標映射與互動
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    if (!camera3D) return new THREE.Vector3(0,0,0);
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

function updateSlimePhysics() {
    if (!slimeMesh) return;

    if (!handData.hasHand) {
        isGrabbed = false;
        // 找不到手時，不更新狀態文字 (維持鏡頭開啟狀態)
        recoverMeshToNormal();
        return;
    }

    // 映射至 3D 空間 ( targetZ = 0.5)
    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.3) { // 手機端拉大判定判定
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取中！指腹肉墊捏持";
        statusElement.style.color = "#a855f7";
        slimeMesh.position.lerp(pinchWorld, 0.22); // 加快跟隨速度

        let localPinch = pinchWorld.clone().sub(slimeMesh.position);
        for (let i = 0; i < positions.count; i++) {
            let origX = originalPositions.getX(i);
            let origY = originalPositions.getY(i);
            let origZ = originalPositions.getZ(i);
            let currentX = positions.getX(i);
            let currentY = positions.getY(i);
            let currentZ = positions.getZ(i);

            let vertexPos = new THREE.Vector3(origX, origY, origZ);
            let distToLocalPinch = vertexPos.distanceTo(localPinch);
            let effectRadius = 1.0;

            if (distToLocalPinch < effectRadius) {
                let force = Math.pow(1.0 - (distToLocalPinch / effectRadius), 2.0); // 加大肉體感凹陷力道
                positions.setXYZ(i, 
                    THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.45),
                    THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.45),
                    THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.45)
                );
            }
        }
    } else {
        if (handData.hasHand) {
            statusElement.innerText = " 👋 看到手了！請主動捏拿中央球體";
            statusElement.style.color = "#10b981";
        }
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    slimeMesh.geometry.computeVertexNormals();
}

function recoverMeshToNormal() {
    if (!slimeMesh) return;
    const positions = slimeMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setXYZ(i, 
            THREE.MathUtils.lerp(positions.getX(i), originalPositions.getX(i), 0.08), // 回彈速率設慢一點展現黏度
            THREE.MathUtils.lerp(positions.getY(i), originalPositions.getY(i), 0.08),
            THREE.MathUtils.lerp(positions.getZ(i), originalPositions.getZ(i), 0.08)
        );
    }
}

// 5. 終極合併迴圈：同時處理 AI 影像發送與 3D 渲染 (使用標準 3D 渲染流程)
async function animateLoop() {
    if (!renderer || !scene || !camera3D) {
        requestAnimationFrame(animateLoop);
        return;
    }
    
    requestAnimationFrame(animateLoop);
    
    // 自轉與微微漂浮晃動
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.08;
        slimeMesh.rotation.y += 0.01;
    }

    // 在同個框幀裡發送影像給 AI，絕對不塞車
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && handsAI) {
        await handsAI.send({ image: videoElement });
    }

    updateSlimePhysics();
    
    renderer.render(scene, camera3D);
}

window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;

    camera3D.aspect = width / height;
    // 直式手機自動切換超廣角拉回物件
    camera3D.fov = isPortrait ? 65 : 50; 
    camera3D.updateProjectionMatrix();
    renderer.setSize(width, height);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.set(0, 0, 0); // 回歸中央
    }
});

// 單一入口點：DOMContentLoaded (確保 DOM ready 後初始化)
window.addEventListener('DOMContentLoaded', initThreeEngine);