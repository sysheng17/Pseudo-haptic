// ==========================================
// 材質與相容性防卡死版 pseudo-haptics.js (修正一片黑無紫球問題)
// ==========================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');
const videoElement = document.getElementById('webcam');

let scene, camera3D, renderer, slimeMesh, originalPositions;
let isGrabbed = false; 

// 全域共享的手勢資料狀態
let handData = {
    hasHand: false,
    pinchCenterNDC: { x: 0, y: 0, z: 0 },
    isPinching: false
};

// 1. 初始化 3D 引擎：強制不透明，確保畫布顯現
function initThree() {
    try {
        scene = new THREE.Scene();
        // 如果看不到 AR 鏡頭，我們先把背景塗成深藍黑色，強制顯示 3D 空間
        scene.background = new THREE.Color(0x0f172a); 

        camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5); // 稍微拉遠相機視距

        // 初始化渲染器 (✨核心修正：alpha: false 關閉透明背景，防止被隱形 ✨)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 強制讓畫布釘在最上層
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '999';

        // 光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(2, 4, 3);
        scene.add(dirLight);

        // 史萊姆幾何體
        const geometry = new THREE.SphereGeometry(0.7, 32, 32); // 稍為放大 0.7
        originalPositions = geometry.attributes.position.clone();
        
        // ✨核心修正：材質除錯模式✨
        // 關閉紫色果凍，換成不透明的亮綠色「線框模式」，確認幾何體是否存在。
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,        // 亮綠色
            wireframe: true,        // 開啟線框
            wireframeLinewidth: 2
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); // 死鎖在中央
        scene.add(slimeMesh);

        console.log("Three.js 渲染器強制顯色啟動成功！材質: Wireframe");
        animate();
    } catch (error) {
        statusElement.innerText = "❌ WebGL 初始化失敗: " + error.message;
    }
}

// 座標映射轉換工具
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    if (!camera3D) return new THREE.Vector3(0,0,0);
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 2. 核心：主動抓取與形變管線 (延遲初始化)
function updateGrabPipeline() {
    // 只有在 hand-tracker.js 成功載入後才有資料
    if (typeof handData === 'undefined' || !handData.hasHand || !slimeMesh) {
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.1) {
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取中！指腹肉墊捏持";
        statusElement.style.color = "#a855f7";

        slimeMesh.position.lerp(pinchWorld, 0.25); // 手機端加快隨動速度

        let localPinch = pinchWorld.clone().sub(slimeMesh.position);
        
        for (let i = 0; i < positions.count; i++) {
            let currentX = positions.getX(i);
            let currentY = positions.getY(i);
            let currentZ = positions.getZ(i);

            let origX = originalPositions.getX(i);
            let origY = originalPositions.getY(i);
            let origZ = originalPositions.getZ(i);

            let vertexPos = new THREE.Vector3(origX, origY, origZ);
            let distToLocalPinch = vertexPos.distanceTo(localPinch);
            let effectRadius = 0.8;

            if (distToLocalPinch < effectRadius) {
                let force = Math.pow(1.0 - (distToLocalPinch / effectRadius), 1.5);
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.45);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.45);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.45);
                positions.setXYZ(i, pullX, pullY, pullZ);
            }
        }
    } else {
        if (handData.hasHand) {
            statusElement.innerText = " 👋 看到手了！請捏內中央綠球";
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
        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.1); 
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.1);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.1);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

// 3. 主動畫循環
function animate() {
    requestAnimationFrame(animate);
    
    // 如果沒被抓，在中央漂浮自轉
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.1;
        slimeMesh.rotation.y += 0.01;
    }

    updateGrabPipeline();
    
    if (renderer && scene && camera3D) {
        renderer.render(scene, camera3D);
    }
}

window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.set(0, 0, 0); // 回歸中央
    }
});

// 單一入口點：確保全網頁載入後只呼叫 initThree
window.addEventListener('load', initThree);