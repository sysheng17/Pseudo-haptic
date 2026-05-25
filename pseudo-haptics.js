// ==========================================
// 終極相容性與自我診斷版 pseudo-haptics.js
// ==========================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');

// 1. 初始化 Three.js (加入錯誤捕捉機制)
let scene, camera3D, renderer, slimeMesh, originalPositions;
let isGrabbed = false;

function initThree() {
    try {
        scene = new THREE.Scene();
        
        // 為了防止部分手機不支援透明背景，這裡加上除錯底色，但優先嘗試透明
        camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5);

        // 嘗試開啟透明，若不支援則會退回預設底色
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 2. 設置光源 (加強亮度，防止因為太暗看不到)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        // 3. 建立高密度史萊姆 (暫時關閉透明，確保 100% 顯色)
        const geometry = new THREE.SphereGeometry(0.6, 32, 32); // 稍微放大，降低面數提高流暢度
        originalPositions = geometry.attributes.position.clone();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7,        // 亮紫色
            roughness: 0.2,
            metalness: 0.1,
            wireframe: false        // 如果還是看不到，可以手動改成 true 看看有沒有線框
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); // 強制死鎖在正中央
        scene.add(slimeMesh);

        console.log("Three.js 渲染器初始化成功！");
        animate();
    } catch (error) {
        statusElement.innerText = "❌ WebGL 初始化失敗: " + error.message;
        statusElement.style.color = "#ef4444";
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

// 4. 核心：主動抓取與形變管線
function updateGrabSandboxPipeline() {
    if (!slimeMesh || !geometry) return;

    // 如果 handData 還沒被 hand-tracker.js 載入或找不到手
    if (typeof handData === 'undefined' || !handData.hasHand) {
        isGrabbed = false;
        statusElement.innerText = " 🔍 等待手部鏡頭信號...";
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenter.x, handData.pinchCenter.y, 0);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.0) { // 放大判定半徑，讓手機更好抓
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取成功！移動中";
        statusElement.style.color = "#a855f7";

        slimeMesh.position.lerp(pinchWorld, 0.25); // 加快跟隨速度

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
            let effectRadius = 0.8;

            if (distToLocalPinch < effectRadius) {
                let pull = Math.pow(1.0 - (distToLocalPinch / effectRadius), 2);
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, pull * 0.5);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, pull * 0.5);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, pull * 0.5);
                positions.setXYZ(i, pullX, pullY, pullZ);
            }
        }
    } else {
        statusElement.innerText = " 👋 看到手了！請捏內中央物體";
        statusElement.style.color = "#10b981";
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

function recoverMeshToNormal() {
    if (!geometry) return;
    const positions = geometry.attributes.position;
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

// 5. 主動畫循環
function animate() {
    requestAnimationFrame(animate);
    
    // 沒被抓時，在中央慢速自轉並微微上下漂浮
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.1;
        slimeMesh.rotation.y += 0.01;
    }

    updateGrabSandboxPipeline();
    if (renderer && scene && camera3D) {
        renderer.render(scene, camera3D);
    }
}

// 視窗縮放與旋轉適配
window.addEventListener('resize', () => {
    if (!camera3D || !renderer) return;
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.set(0, 0, 0);
    }
});

// 確保頁面載入完成後才初始化 3D
window.addEventListener('DOMContentLoaded', initThree);