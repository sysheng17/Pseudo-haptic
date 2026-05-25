// ==========================================
// 測試專用：強制不透明版 pseudo-haptics.js (排除隱形 Bug)
// ==========================================

const container = document.getElementById('canvas-container');
const statusElement = document.getElementById('status');

let scene, camera3D, renderer, slimeMesh, originalPositions;
let isGrabbed = false; 

function initThree() {
    try {
        scene = new THREE.Scene();
        
        // 【核心修正】如果看不到，我們直接把背景塗成深藍黑色，強制顯示 3D 空間
        scene.background = new THREE.Color(0x0f172a); 

        camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        camera3D.position.set(0, 0, 5);

        // 【核心修正】關閉 alpha 透明，強制硬體必須渲染出實體畫布
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // 強制讓畫布高寬撐滿，不允許被手機壓縮
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';

        // 光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(2, 4, 3);
        scene.add(dirLight);

        // 史萊姆幾何體
        const geometry = new THREE.SphereGeometry(0.6, 32, 32); 
        originalPositions = geometry.attributes.position.clone();
        
        // 【核心修正】材質關閉透明度，使用純不透明的亮紫色
        const material = new THREE.MeshStandardMaterial({
            color: 0xa855f7, // 亮紫色
            roughness: 0.2,
            metalness: 0.1
        });
        
        slimeMesh = new THREE.Mesh(geometry, material);
        slimeMesh.position.set(0, 0, 0); // 死鎖在中央
        scene.add(slimeMesh);

        console.log("3D 渲染器強制實體化成功！");
        animate();
    } catch (error) {
        statusElement.innerText = "❌ WebGL 錯誤: " + error.message;
    }
}

function mapTo3DWorld(ndcX, ndcY, targetZ = 0) {
    if (!camera3D) return new THREE.Vector3(0,0,0);
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(camera3D);
    const dir = vec.sub(camera3D.position).normalize();
    const distance = (targetZ - camera3D.position.z) / dir.z;
    return camera3D.position.clone().add(dir.multiplyScalar(distance));
}

function updatePadGrabSandboxPipeline() {
    if (!slimeMesh || typeof handData === 'undefined') return;

    if (!handData.hasHand) {
        isGrabbed = false;
        recoverMeshToNormal();
        return;
    }

    const pinchWorld = mapTo3DWorld(handData.pinchCenterNDC.x, handData.pinchCenterNDC.y, 0.5);
    const distToSlime = pinchWorld.distanceTo(slimeMesh.position);

    if (handData.isPinching) {
        if (!isGrabbed && distToSlime < 1.2) {
            isGrabbed = true;
        }
    } else {
        isGrabbed = false;
    }

    const positions = slimeMesh.geometry.attributes.position;

    if (isGrabbed) {
        statusElement.innerText = " 🟣 抓取中！指腹肉墊捏持";
        statusElement.style.color = "#a855f7";
        slimeMesh.position.lerp(pinchWorld, 0.2);

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
                let pullX = THREE.MathUtils.lerp(currentX, localPinch.x, force * 0.45);
                let pullY = THREE.MathUtils.lerp(currentY, localPinch.y, force * 0.45);
                let pullZ = THREE.MathUtils.lerp(currentZ, localPinch.z, force * 0.45);
                positions.setXYZ(i, pullX, pullY, pullZ);
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
    if (!slimeMesh) return;
    const positions = slimeMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let nextX = THREE.MathUtils.lerp(currentX, origX, 0.05);
        let nextY = THREE.MathUtils.lerp(currentY, origY, 0.05);
        let nextZ = THREE.MathUtils.lerp(currentZ, origZ, 0.05);
        positions.setXYZ(i, nextX, nextY, nextZ);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (!isGrabbed && slimeMesh) {
        slimeMesh.position.y = Math.sin(Date.now() * 0.003) * 0.1;
        slimeMesh.rotation.y += 0.01;
    }
    updatePadGrabSandboxPipeline();
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

window.addEventListener('DOMContentLoaded', initThree);