// 1. 初始化 Three.js 場景
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);

const camera3D = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera3D.position.set(0, 0, 8); // 設定預設相機視距

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// 2. 啟用 OrbitControls 軌道控制器 (解決物體太大，讓使用者自由拉遠拉近)
const controls = new THREE.OrbitControls(camera3D, renderer.domElement);
controls.enableDamping = true;   // 開啟平滑阻尼感
controls.dampingFactor = 0.05;
controls.minDistance = 3;        // 限制鏡頭最近拉到 3 (防穿透物體)
controls.maxDistance = 15;       // 限制鏡頭最遠拉到 15 (防物體過小)

// 3. 加入光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// 4. 建立高密度可變形球體
const geometry = new THREE.SphereGeometry(1.8, 64, 64);
const originalPositions = geometry.attributes.position.clone(); // 備份原始網格頂點
const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.2,
    metalness: 0.1,
    wireframe: false
});
const ballMesh = new THREE.Mesh(geometry, material);
scene.add(ballMesh);

// 5. 建立代表手指位置的「渲染置頂」綠色提示小球 (解決被物體擋住、不知道點在哪的問題)
const pointerGeo = new THREE.SphereGeometry(0.12, 16, 16);
const pointerMat = new THREE.MeshBasicMaterial({ 
    color: 0x10b981,
    depthTest: false,     // 關閉深度測試，使其穿透物體表面顯現
    depthWrite: false     // 不寫入深度資料
});
const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
pointerMesh.renderOrder = 999; // 強制最後才畫，永遠蓋在 3D 模型最上層
scene.add(pointerMesh);

// 6. 核心：視覺觸覺形變處理
function updateMeshDeformation() {
    const positions = geometry.attributes.position;
    const matType = document.getElementById('material-type').value;
    
    // 將 MediaPipe 的 -1~1 空間轉換為 3D 世界座標系中的對齊位置
    const targetX = fingerPoints.index.x * 4;
    const targetY = fingerPoints.index.y * 3;
    pointerMesh.position.set(targetX, targetY, 0.2); // 稍微往前推一點點便於視覺追蹤

    if (matType === 'hard') {
        // 剛體模式：立即將頂點還原
        positions.copy(originalPositions);
        positions.needsUpdate = true;
        return;
    }

    let isInteracting = fingerPoints.isPinching;
    let interactPoint = new THREE.Vector3(fingerPoints.pinchCenter.x * 4, fingerPoints.pinchCenter.y * 3, 0);

    // 遍歷所有網格頂點進行形變計算
    for (let i = 0; i < positions.count; i++) {
        let origX = originalPositions.getX(i);
        let origY = originalPositions.getY(i);
        let origZ = originalPositions.getZ(i);

        let currentX = positions.getX(i);
        let currentY = positions.getY(i);
        let currentZ = positions.getZ(i);

        let vertexWorldPos = new THREE.Vector3(origX, origY, origZ);
        let dist = vertexWorldPos.distanceTo(interactPoint);

        let effectRadius = 1.3; // 影響半徑

        if (isInteracting && dist < effectRadius) {
            // 【揉捏變形階段】
            let force = (1.0 - (dist / effectRadius));
            
            if (matType === 'soft') {
                // 軟糖模式：受壓向內凹，並依據擴散寬度公式向外擴散
                let deformX = origX - (interactPoint.x - origX) * force * 0.35;
                let deformY = origY - (interactPoint.y - origY) * force * 0.35;
                positions.setXYZ(i, deformX, deformY, currentZ);
            } else if (matType === 'sticky') {
                // 史萊姆模式：網格往雙指中心聚集，產生極高黏稠牽絲感
                let stickyX = THREE.MathUtils.lerp(currentX, interactPoint.x, force * 0.3);
                let stickyY = THREE.MathUtils.lerp(currentY, interactPoint.y, force * 0.3);
                positions.setXYZ(i, stickyX, stickyY, currentZ);
            }
        } else {
            // 【彈性復原階段】
            // 史萊姆復原速度慢（0.04）產生拉扯感；軟糖回彈快（0.18）產生Q彈感
            let recoverySpeed = (matType === 'sticky') ? 0.04 : 0.18;
            
            let nextX = THREE.MathUtils.lerp(currentX, origX, recoverySpeed);
            let nextY = THREE.MathUtils.lerp(currentY, origY, recoverySpeed);
            let nextZ = THREE.MathUtils.lerp(currentZ, origZ, recoverySpeed);
            positions.setXYZ(i, nextX, nextY, nextZ);
        }
    }
    
    positions.needsUpdate = true; 
    geometry.computeVertexNormals(); // 重新計算平滑光照陰影
}

// 7. 主渲染循環
function animate() {
    requestAnimationFrame(animate);
    
    // 當使用者沒有揉捏時，球體會慢慢自轉，提昇 3D 立體感
    if (!fingerPoints.isPinching) {
        ballMesh.rotation.y += 0.003;
    }

    controls.update(); // 每次循環同步更新滑鼠縮放/旋轉鏡頭的狀態
    updateMeshDeformation();
    renderer.render(scene, camera3D);
}

// 響應視窗尺寸調整
window.addEventListener('resize', () => {
    camera3D.aspect = window.innerWidth / window.innerHeight;
    camera3D.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 啟動程式
animate();