const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// 調整視野角 (FOV)，讓手機看進去物件大小適中
const camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xa855f7, 0.9);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// 史萊姆本體
const geometry = new THREE.SphereGeometry(0.45, 48, 48); // 稍微調小一點點適配手機螢幕
const originalPositions = geometry.attributes.position.clone();
const material = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85
});
const slimeMesh = new THREE.Mesh(geometry, material);
slimeMesh.position.set(0, 0, 0); 
scene.add(slimeMesh);

let isGrabbed = false; 
const statusElement = document.getElementById('status');

// 動態自適應螢幕比例的 3D 映射公式
function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    
    // 限制邊界，防止手機翻轉時物件飛太遠
    const result = camera3D.position.clone().add(dir.multiplyScalar(distance));
    return result;
}

function updateGrabSandboxPipeline() {
    if (!handData.hasHand) {
        isGrabbed = false;
        statusElement.innerText = " 等待手部...";
        statusElement.style.color = "#cbd5e1";
        recoverMeshToNormal();
        return;
    }

    // 動態計算當前螢幕下的 3D 空間乘數
    const aspect = window.innerWidth / window.innerHeight;
    const pinchWorld = mapTo3DWorld(handData.pinchCenter.x, handData.pinchCenter.y, 0);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 0.8) {
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 抓取中 ✨";
        statusElement.style.color = "#a855f7";

        slimeMesh.position.lerp(pinchWorld, 0.2); // 手機端加快隨動速度

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
            let effectRadius = 0.7;

            if (distToLocalPinch < effectRadius) {
                let pull = Math.pow(1.0 - (distToLocalPinch / effectRadius), 2);
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, pull * 0.45);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, pull * 0.45);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, pull * 0.45);
                positions.setXYZ(i, pullX, pullY, pullZ);
            }
        }
    } else {
        statusElement.innerText = " 漂浮中 👋";
        statusElement.style.color = "#10b981";
        recoverMeshToNormal();
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

function recoverMeshToNormal() {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.08);
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.08);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.08);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (!isGrabbed) {
        slimeMesh.position.y += Math.sin(Date.now() * 0.003) * 0.0015;
        slimeMesh.rotation.y += 0.005;
    }
    updateGrabSandboxPipeline();
    renderer.render(scene, camera3D);
}

// ✨【橫豎螢幕動態切換核心修正】
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // 1. 重設渲染器尺寸
    renderer.setSize(width, height);
    
    // 2. 重新計算投影長寬比，防止史萊姆噴到外太空
    camera3D.aspect = width / height;
    camera3D.updateProjectionMatrix();
    
    // 3. 如果沒被抓取，自動把史萊姆拉回當前畫面的正中央
    if (!isGrabbed) {
        slimeMesh.position.set(0, 0, 0);
    }
});

animate();