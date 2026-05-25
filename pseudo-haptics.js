// ==========================================
// 執行緒解鎖：一體化相機與 3D 驅動版 pseudo-haptics.js
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
        // 強制深藍黑色背景，先排除任何隱形可能
        scene.background = new THREE.Color(0x0f172a); 

        camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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

        // 光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(2, 4, 3);
        scene.add(dirLight);

        // 史萊姆本體
        const geometry = new THREE.SphereGeometry(0.6, 32, 32); 
        originalPositions = geometry.attributes.position.clone();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7, // 亮紫色
            roughness: 0.2,
            metalness: 0.1
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); 
        scene.add(slimeMesh);

        console.log("【第一階段】3D 引擎啟動成功，畫面應該要變黑並出現紫球。");
        
        // 3D 成功後，才啟動第二階段：載入 AI 與鏡頭
        initMediaPipeAI();
        
    } catch (error) {
        statusElement.innerText = "❌ Three.js 錯誤: " + error.message;
    }
}

// 2. 第二步：3D 好了才載入 MediaPipe AI
function initMediaPipeAI() {
    statusElement.innerText = "🤖 正在載入 AI 辨識模組...";
    try {
        handsAI = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsAI.setOptions({
            maxNumHands: 1,
            modelComplexity: 0, // 手機端輕量化
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        handsAI.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                handData.hasHand = true;
                const landmarks = results.multiHandLandmarks[0];
                
                handData.indexPad.x = (1 - landmarks[7].x) * 2 - 1;
                handData.indexPad.y = (1 - landmarks[7].y) * 2 - 1;
                handData.indexPad.z = landmarks[7].z;

                handData.thumbPad.x = (1 - landmarks[3].x) * 2 - 1;
                handData.thumbPad.y = (1 - landmarks[3].y) * 2 - 1;
                handData.thumbPad.z = landmarks[3].z;

                const dist2D = Math.sqrt(
                    Math.pow(handData.indexPad.x - handData.thumbPad.x, 2) +
                    Math.pow(handData.indexPad.y - handData.thumbPad.y, 2)
                );

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
        });

        // AI 模組設定好後，才開啟鏡頭
        startCameraStream();
    } catch (e) {
        statusElement.innerText = "❌ AI 模組載入失敗";
    }
}

// 3. 第三步：開啟鏡頭
async function startCameraStream() {
    statusElement.innerText = "📷 正在喚醒相機權限...";
    try {
        const constraints = {
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            statusElement.innerText = "🔍 鏡頭已開啟，尋找手部中...";
            statusElement.style.color = "#eab308";
            // 全部的準備工作都完成了，開啟主渲染迴圈！
            animateLoop();
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
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching && distToSlime < 1.2) {
        isGrabbed = true;
    } else if (!handData.isPinching) {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取中！指腹肉墊捏持";
        statusElement.style.color = "#a855f7";
        slimeMesh.position.lerp(pinchWorld, 0.18);

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
            let effectRadius = 1.2;

            if (distToLocalPinch < effectRadius) {
                let force = Math.pow(1.0 - (distToLocalPinch / effectRadius), 1.5);
                positions.setXYZ(i, 
                    THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.45),
                    THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.45),
                    THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.45)
                );
            }
        }
    } else {
        if (handData.hasHand) {
            statusElement.innerText = " 👋 看到手了！請捏拿中央紫色球";
            statusElement.style.color = "#10b981";
        }
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    slimeMesh.geometry.computeVertexNormals();
}

function recoverMeshToNormal() {
    const positions = slimeMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setXYZ(i, 
            THREE.MathUtils.lerp(positions.getX(i), originalPositions.getX(i), 0.05),
            THREE.MathUtils.lerp(positions.getY(i), originalPositions.getY(i), 0.05),
            THREE.MathUtils.lerp(positions.getZ(i), originalPositions.getZ(i), 0.05)
        );
    }
}

// 5. 終極合併迴圈：同時處理 AI 影像發送與 3D 渲染
async function animateLoop() {
    requestAnimationFrame(animateLoop);
    
    // 自轉漂浮
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.1;
        slimeMesh.rotation.y += 0.01;
    }

    // 在 3D 渲染的同個框幀裡，順便把影像送給 AI，絕對不塞車
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && handsAI) {
        await handsAI.send({ image: videoElement });
    }

    updateSlimePhysics();
    
    if (renderer && scene && camera3D) {
        renderer.render(scene, camera3D);
    }
}

window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 單一入口點：確保全網頁載入後只呼叫這一個
window.addEventListener('load', initThreeEngine);
