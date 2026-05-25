// 1. 初始化 Three.js 透明場景
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera3D = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// 2. 設置光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xa855f7, 0.9); // 紫色光源
dirLight.position.set(3, 4, 3);
scene.add(dirLight);

// 3. 建立高密度史萊姆 (初始位置固定在螢幕正中央 0, 0, 0)
const geometry = new THREE.SphereGeometry(0.5, 64, 64);
const originalPositions = geometry.attributes.position.clone();
const material = new THREE.MeshStandardMaterial({
    color: 0xa855f7,        // 改成神祕的紫色史萊姆
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
});
const slimeMesh = new THREE.Mesh(geometry, material);
slimeMesh.position.set(0, 0, 0); // 初始置中
scene.add(slimeMesh);

// 4. 抓取狀態機變數
let isGrabbed = false; 
const statusElement = document.getElementById('status');

// 座標映射轉換工具
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

// 5. 核心：主動抓取與黏滯隨動運算管線
function updateGrabSandboxPipeline() {
    if (!handData.hasHand) {
        isGrabbed = false; // 手離開鏡頭自動放開
        statusElement.innerText = " 等待右手伸入...";
        statusElement.style.color = "#eab308";
        recoverMeshToNormal();
        return;
    }

    // 將大腦判定的捏合中心點轉換為 3D 世界座標
    const pinchWorld = mapTo3DWorld(handData.pinchCenter.x, handData.pinchCenter.y, 0);
    
    // 計算手部捏合點與史萊姆當前中心點的距離
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    // 狀態機判定
    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 0.7) {
            // 條件成立：手正在捏，且夠靠近史萊姆 -> 成功抓取！
            isGrabbed = true;
        }
    } else {
        // 手指放開 -> 釋放物件，留在原地
        isGrabbed = false;
    }

    const positions = geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 抓取成功！捏持移動中";
        statusElement.style.color = "#a855f7";

        // 史萊姆中心點平滑跟隨手掌移動 (加上微量線性插值 Lerp，製造水球晃動的遲滯體感)
        slimeMesh.position.lerp(pinchWorld, 0.15);

        // 【高黏滯牽絲幾何形變】
        // 當移動速度太快時，網格頂點會往捏持點(Pinch)極度拉伸，產生被扯長的效果
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
            let effectRadius = 0.9;

            if (distToLocalPinch < effectRadius) {
                let pull = Math.pow(1.0 - (distToLocalPinch / effectRadius), 2);
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, pull * 0.4);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, pull * 0.4);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, pull * 0.4);
                positions.setXYZ(i, pullX, pullY, pullZ);
            }
        }
    } else {
        statusElement.innerText = " 漂浮中...請伸手抓取";
        statusElement.style.color = "#10b981";
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

// 輔助函式：讓網格頂點以極高黏滯度（慢速）縮回原本的球體形狀
function recoverMeshToNormal() {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);

        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.06); // 0.06 速率展現史萊姆的厚重黏感
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.06);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.06);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

// 6. 主動畫渲染循環
function animate() {
    requestAnimationFrame(animate);
    
    // 如果沒被抓取，自己在原地微微上下漂浮晃動，像一隻史萊姆生物
    if (!isGrabbed) {
        slimeMesh.position.y += Math.sin(Date.now() * 0.003) * 0.002;
        slimeMesh.rotation.y += 0.004;
    }

    updateGrabSandboxPipeline();
    renderer.render(scene, camera3D);
}

window.addEventListener('resize', () => {
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();