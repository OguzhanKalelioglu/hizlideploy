// Global variables
let projects = [];
let ws = null;
let currentProjectId = null;
let projectTypes = [];
let selectedFile = null; // Drag & drop ile seçilen dosyayı tutacak
let bottomLogCount = 0;
let activeBottomLogProject = null;
let currentView = 'card'; // 'card' or 'list'

// DOM elements
const projectModal = new bootstrap.Modal(document.getElementById('projectModal'));
const logsModal = new bootstrap.Modal(document.getElementById('logsModal'));
const createProjectModal = new bootstrap.Modal(document.getElementById('createProjectModal'));
const uploadProjectModal = new bootstrap.Modal(document.getElementById('uploadProjectModal'));
const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
const toast = new bootstrap.Toast(document.getElementById('toast'));

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    loadDashboardStats();
    loadProjectTypes();
    setupEventListeners();
    initializeWebSocket();
});

function showLoadingIndicator() {
    const projectsContainer = document.getElementById('projectsContainer');
    if (projectsContainer) {
        projectsContainer.innerHTML = `
            <div class="w-100 text-center p-5">
                <i class="fas fa-spinner fa-spin fa-2x text-primary"></i>
                <p class="mt-2 text-muted">Projeler yükleniyor...</p>
            </div>
        `;
    }
}

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket bağlantısı kuruldu.');
            // Eğer aktif bir log takibi varsa tekrar subscribe ol
            if (activeBottomLogProject) {
                subscribeToProject(activeBottomLogProject);
            }
        };
        
        ws.onclose = () => {
            console.log('WebSocket bağlantısı kapandı. 3 saniye içinde tekrar denenecek...');
            setTimeout(initializeWebSocket, 3000);
        };
        
        ws.onerror = (error) => console.error('WebSocket hatası:', error);

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('🔄 WebSocket mesajı alındı:', message);
                if (message.type === 'log') {
                    handleLogMessage(message);
                } else if (message.type === 'project_update') {
                    loadProjects();
                }
            } catch (error) {
                console.error('WebSocket mesajı işlenirken hata oluştu:', error);
                console.error('Raw event data:', event.data);
            }
        };
    } catch (error) {
        console.error('WebSocket bağlantı hatası:', error);
        setTimeout(initializeWebSocket, 3000);
    }
}

// Projeye log takibi için abone ol
function subscribeToProject(projectId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const subscribeMessage = {
            type: 'subscribe_logs',
            projectId: projectId
        };
        ws.send(JSON.stringify(subscribeMessage));
        console.log(`📡 Proje ${projectId} loglarına abone olundu`, subscribeMessage);
    } else {
        console.error('❌ WebSocket bağlantısı hazır değil:', ws ? ws.readyState : 'ws null');
    }
}

// Proje aboneliğini iptal et
function unsubscribeFromProject() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'unsubscribe_logs'
        }));
    }
}

function setupEventListeners() {
    // Action buttons
    document.getElementById('createProjectBtn').addEventListener('click', showCreateProjectModal);
    document.getElementById('uploadProjectBtn').addEventListener('click', showUploadProjectModal);
    document.getElementById('syncProjectsBtn').addEventListener('click', syncProjects);

    document.getElementById('refreshBtn').addEventListener('click', loadProjects);
    
    // Create project form
    document.getElementById('createProjectForm').addEventListener('submit', handleCreateProject);
    document.getElementById('projectType').addEventListener('change', handleProjectTypeChange);
    
    // Upload project form
    document.getElementById('uploadProjectForm').addEventListener('submit', handleUploadProject);
    
    // Settings form
    document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings);
    document.getElementById('selectFileBtn').addEventListener('click', () => document.getElementById('projectFile').click());
    document.getElementById('projectFile').addEventListener('change', handleFileSelect);
    document.getElementById('removeFileBtn').addEventListener('click', removeSelectedFile);
    
    // Drag and drop
    setupDragAndDrop();
    
    // Log buttons
    document.querySelectorAll('[data-log-type]').forEach(btn => {
        btn.addEventListener('click', function() {
            const logType = this.dataset.logType;
            loadLogs(currentProjectId, logType);
            
            // Update active button
            document.querySelectorAll('[data-log-type]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
}

// UI functions
function showMainContent() {
    document.getElementById('mainContent').style.display = 'block';
}

function showToast(message, type = 'info') {
    const toastBody = document.getElementById('toastBody');
    const toastElement = document.getElementById('toast');
    
    toastBody.textContent = message;
    
    // Change toast color based on type
    toastElement.className = `toast ${type === 'error' ? 'bg-danger text-white' : type === 'success' ? 'bg-success text-white' : 'bg-info text-white'}`;
    
    toast.show();
}

// API functions
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
        const response = await fetch(endpoint, mergedOptions);
        return await response.json();
    } catch (error) {
        console.error('API Request Error:', error);
        showToast('Sunucu hatası', 'error');
        return null;
    }
}

// Project functions
async function loadProjects() {
    try {
        showLoadingIndicator();
        const data = await apiRequest('/api/projects');
        if (data) {
            projects = data;
            renderProjects(projects);
            updateStats();
        }
    } catch (error) {
        console.error('Load projects error:', error);
    }
}

async function syncProjects() {
    try {
        showToast('Projeler taranıyor...', 'info');
        
        const data = await apiRequest('/api/projects/sync', {
            method: 'POST'
        });
        
        if (data) {
            showToast(`${data.count} proje senkronize edildi`, 'success');
            loadProjects();
        }
    } catch (error) {
        console.error('Sync projects error:', error);
    }
}

function getProjectTypeInfo(type) {
    const typeMap = {
        'nodejs': { name: 'Node.js', icon: 'fab fa-node-js' },
        'python-flask': { name: 'Python Flask', icon: 'fab fa-python' },
        'python-django': { name: 'Python Django', icon: 'fab fa-python' },
        'react': { name: 'React', icon: 'fab fa-react' },
        'vue': { name: 'Vue.js', icon: 'fab fa-vuejs' },
        'static': { name: 'Statik Site', icon: 'fas fa-globe' },
        'php': { name: 'PHP', icon: 'fab fa-php' }
    };
    return typeMap[type] || { name: type, icon: 'fas fa-project-diagram' };
}

function renderProjects(projects) {
    if (currentView === 'card') {
        renderProjectsCard(projects);
    } else {
        renderProjectsList(projects);
    }
}

function renderProjectsCard(projects) {
    const projectsContainer = document.getElementById('projectsContainer');
    if (projects.length === 0) {
        projectsContainer.innerHTML = `
            <div class="w-100 text-center p-4">
                <p class="text-muted">Henüz proje bulunamadı.</p>
                <button class="btn btn-primary" onclick="syncProjects()"><i class="fas fa-sync"></i> Projeleri Tara</button>
            </div>
        `;
        return;
    }

    const projectHtml = `
        <div class="row">
            ${projects.map(project => {
                const statusInfo = getStatusInfo(project.status);
                const lastDeploymentStatus = project.last_deployment_status 
                    ? getDeploymentStatusInfo(project.last_deployment_status)
                    : { text: 'Yok', class: 'secondary' };
                
                const isRunning = project.status === 'running';
                const projectUrl = isRunning && project.external_port ? `http://localhost:${project.external_port}` : null;

                return `
                    <div class="project-card-wrapper">
                        <div class="card project-card ${isRunning ? 'project-running' : ''}">
                            <div class="card-body d-flex flex-column">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <h6 class="card-title mb-0">
                                        <i class="${getProjectTypeInfo(project.type)?.icon || 'fas fa-project-diagram'}"></i> ${project.name}
                                    </h6>
                                    <span class="badge bg-${statusInfo.class}">${statusInfo.text}</span>
                                </div>
                                <p class="card-text text-muted small mb-3">${project.description || 'Açıklama yok'}</p>
                                <div class="mt-auto">
                                    ${project.external_port ? `
                                        <div class="d-flex justify-content-between text-muted small mb-2">
                                            <span>Port:</span>
                                            <div>
                                                <span class="badge bg-info">${project.external_port}</span>
                                                ${isRunning ? `
                                                    <a href="${projectUrl}" target="_blank" class="ms-2" title="Projeyi Aç">
                                                        <i class="fas fa-external-link-alt"></i>
                                                    </a>
                                                ` : ''}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="card-footer">
                                <div class="btn-toolbar justify-content-between" role="toolbar">
                                    <div class="btn-group" role="group">
                                        ${isRunning ? `
                                            <button class="btn btn-warning btn-sm" onclick="stopProject(${project.id})" title="Durdur">
                                                <i class="fas fa-stop"></i>
                                            </button>
                                            <button class="btn btn-info btn-sm" onclick="restartProject(${project.id})" title="Yeniden Başlat">
                                                <i class="fas fa-sync-alt"></i>
                                            </button>
                                        ` : `
                                            <button class="btn btn-success btn-sm" onclick="startProject(${project.id})" title="Başlat">
                                                <i class="fas fa-play"></i>
                                            </button>
                                        `}
                                        <button class="btn btn-primary btn-sm" onclick="deployProject(${project.id})" title="${isRunning ? 'Güncelle' : 'Deploy'}">
                                            <i class="fas fa-rocket"></i>
                                        </button>
                                    </div>
                                    
                                    <div class="btn-group" role="group">
                                        <button class="btn btn-outline-info btn-sm" onclick="showLogs(${project.id})" title="Loglar">
                                            <i class="fas fa-terminal"></i>
                                        </button>
                                                                 <button class="btn btn-outline-secondary btn-sm" onclick="showProjectSettings(${project.id})" title="Ayarlar">
                             <i class="fas fa-cog"></i>
                         </button>
                                        <button class="btn btn-outline-danger btn-sm" onclick="deleteProject(${project.id})" title="Sil">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    projectsContainer.innerHTML = projectHtml;
}

function renderProjectsList(projects) {
    const projectsTableBody = document.getElementById('projectsTableBody');
    if (projects.length === 0) {
        projectsTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <p class="text-muted mb-2">Henüz proje bulunamadı.</p>
                    <button class="btn btn-primary btn-sm" onclick="syncProjects()"><i class="fas fa-sync"></i> Projeleri Tara</button>
                </td>
            </tr>
        `;
        return;
    }

    const tableHtml = projects.map(project => {
        const statusInfo = getStatusInfo(project.status);
        const projectTypeInfo = getProjectTypeInfo(project.type);
        const isRunning = project.status === 'running';

        return `
            <tr class="${isRunning ? 'table-success' : ''}">
                <td>
                    <div class="d-flex align-items-center">
                        <i class="${projectTypeInfo.icon} me-2"></i>
                        <div>
                            <strong>${project.name}</strong>
                            <br>
                            <small class="text-muted">${project.description || 'Açıklama yok'}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge bg-secondary">${projectTypeInfo.name}</span>
                </td>
                <td>
                    <span class="badge bg-${statusInfo.class}">${statusInfo.text}</span>
                </td>
                <td>
                    ${project.external_port ? `
                        <span class="badge bg-info">${project.external_port}</span>
                        ${isRunning ? `
                            <a href="http://localhost:${project.external_port}" target="_blank" class="ms-2" title="Projeyi Aç">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        ` : ''}
                    ` : '<span class="text-muted">-</span>'}
                </td>
                <td class="project-actions">
                    <div class="btn-group" role="group">
                        ${isRunning ? `
                            <button class="btn btn-warning btn-sm" onclick="stopProject(${project.id})" title="Durdur">
                                <i class="fas fa-stop"></i>
                            </button>
                            <button class="btn btn-info btn-sm" onclick="restartProject(${project.id})" title="Yeniden Başlat">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        ` : `
                            <button class="btn btn-success btn-sm" onclick="startProject(${project.id})" title="Başlat">
                                <i class="fas fa-play"></i>
                            </button>
                        `}
                        <button class="btn btn-primary btn-sm" onclick="deployProject(${project.id})" title="${isRunning ? 'Güncelle' : 'Deploy'}">
                            <i class="fas fa-rocket"></i>
                        </button>
                        <button class="btn btn-outline-info btn-sm" onclick="showLogs(${project.id})" title="Loglar">
                            <i class="fas fa-terminal"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="showProjectSettings(${project.id})" title="Ayarlar">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="deleteProject(${project.id})" title="Sil">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    projectsTableBody.innerHTML = tableHtml;
}

function switchView(viewType) {
    currentView = viewType;
    
    const cardViewBtn = document.getElementById('cardViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    const cardView = document.getElementById('projectsContainer');
    const listView = document.getElementById('projectsTable');
    
    if (viewType === 'card') {
        cardViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        cardView.classList.add('active');
        listView.classList.remove('active');
    } else {
        listViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
        listView.classList.add('active');
        cardView.classList.remove('active');
    }
    
    // Re-render projects in the new view
    renderProjects(projects);
}

function getDeploymentStatusInfo(status) {
    switch (status) {
        case 'success': return { text: 'Başarılı', class: 'primary' };
        case 'failed': return { text: 'Başarısız', class: 'danger' };
        case 'building': return { text: 'Hazırlanıyor', class: 'info' };
        case 'pending': return { text: 'Beklemede', class: 'warning' };
        default: return { text: status || 'Bilinmiyor', class: 'secondary' };
    }
}

// Proje durumuna göre renk ve metin döndürür
function getStatusInfo(status) {
    switch (status) {
        case 'running': return { text: 'Çalışıyor', class: 'success' };
        case 'stopped': return { text: 'Durduruldu', class: 'secondary' };
        case 'error': return { text: 'Hata', class: 'danger' };
        case 'building': return { text: 'Build Ediliyor', class: 'info' };
        case 'pending': return { text: 'Bekliyor', class: 'warning' };
        default: return { text: status || 'Bilinmiyor', class: 'secondary' };
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR');
}

function updateStats() {
    const totalProjects = projects.length;
    const runningProjects = projects.filter(p => p.status === 'running').length;
    const usedPorts = projects.filter(p => p.external_port).length;
    
    document.getElementById('totalProjects').textContent = totalProjects;
    document.getElementById('runningProjects').textContent = runningProjects;
    document.getElementById('usedPorts').textContent = usedPorts;
    
    // Load deployment stats
    // loadDeploymentStats(); // This function is removed, so this line is removed.
}

// Project actions
async function startProject(projectId) {
    try {
        showToast('Proje başlatılıyor...', 'info');
        
        const data = await apiRequest(`/api/deployments/start/${projectId}`, {
            method: 'POST'
        });
        
        if (data && (data.pid || data.message.includes('başlatıldı'))) {
            showToast(`Proje başlatıldı`, 'success');
            loadProjects();
        } else {
            showToast(data.message || data.error || 'Proje başlatılamadı', 'error');
        }
    } catch (error) {
        console.error('Start project error:', error);
    }
}

async function stopProject(projectId) {
    try {
        const data = await apiRequest(`/api/deployments/stop/${projectId}`, {
            method: 'POST'
        });
        
        if (data) {
            showToast('Proje durduruldu', 'success');
            loadProjects();
        }
    } catch (error) {
        console.error('Stop project error:', error);
    }
}

async function restartProject(projectId) {
    try {
        const data = await apiRequest(`/api/deployments/restart/${projectId}`, {
            method: 'POST'
        });
        
        if (data) {
            showToast('Proje yeniden başlatıldı', 'success');
            loadProjects();
        }
    } catch (error) {
        console.error('Restart project error:', error);
    }
}

async function deployProject(projectId) {
    try {
        const data = await apiRequest(`/api/deployments/deploy/${projectId}`, {
            method: 'POST'
        });
        
        if (data) {
            showBottomLogPanel(projectId);
            loadProjects();
        }
    } catch (error) {
        console.error('Deploy project error:', error);
        showToast(error.message || 'Deployment başlatılamadı', 'error');
    }
}

async function editPort(projectId) {
    // Port düzenleme işlemi için doğrudan ayarlar menüsünü aç
    showProjectSettings(projectId);
    showToast('Port ayarını bu menüden değiştirebilirsiniz.', 'info');
}

async function deleteProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        showToast('Proje bulunamadı', 'error');
        return;
    }
    
    if (confirm(`"${project.name}" projesini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
        try {
            const data = await apiRequest(`/api/projects/${projectId}`, {
                method: 'DELETE'
            });
            
            if (data && data.success) {
                showToast('Proje başarıyla silindi', 'success');
                loadProjects();
            } else {
                showToast(data?.error || 'Proje silinemedi', 'error');
            }
        } catch (error) {
            console.error('Delete project error:', error);
            showToast('Proje silme hatası', 'error');
        }
    }
}

// Settings modal fonksiyonları
async function showProjectSettings(projectId) {
    try {
        const data = await apiRequest(`/api/projects/${projectId}`);
        if (data) {
            // Modal'ı doldur
            document.getElementById('settingsModalTitle').textContent = `${data.name} - Ayarlar`;
            document.getElementById('settingsProjectName').value = data.name;
            document.getElementById('settingsProjectDescription').value = data.description || '';
            document.getElementById('settingsProjectPort').value = data.external_port || '';
            
            // Status badge'ini güncelle
            const statusBadge = document.getElementById('settingsProjectStatus');
            const statusInfo = getStatusInfo(data.status);
            statusBadge.textContent = statusInfo.text;
            statusBadge.className = `badge bg-${statusInfo.class}`;
            
            // Path göster
            document.getElementById('settingsProjectPath').textContent = data.path;
            
            // Project ID'yi form'a ekle (gizli olarak)
            const form = document.getElementById('settingsForm');
            form.dataset.projectId = projectId;
            form.dataset.projectStatus = data.status;
            
            settingsModal.show();
        }
    } catch (error) {
        console.error('Show project settings error:', error);
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    
    const form = e.target;
    const projectId = form.dataset.projectId;
    const projectStatus = form.dataset.projectStatus;
    
    const newName = document.getElementById('settingsProjectName').value;
    const newDescription = document.getElementById('settingsProjectDescription').value;
    const newPortRaw = document.getElementById('settingsProjectPort').value;
    const newPort = newPortRaw ? parseInt(newPortRaw) : null;

    const currentProject = projects.find(p => p.id == projectId);
    if (!currentProject) {
        showToast('Proje bulunamadı.', 'error');
        return;
    }

    let settingsUpdated = false;

    // Port güncelleme mantığı
    const oldPort = currentProject.external_port;
    if (newPort !== oldPort) {
        if (projectStatus === 'running') {
            showToast('Portu değiştirmek için lütfen önce projeyi durdurun.', 'error');
            return;
        }

        if (newPort !== null && (isNaN(newPort) || newPort < 1024 || newPort > 65535)) {
            showToast('Geçersiz port numarası. Port 1024-65535 arasında olmalıdır.', 'error');
            return;
        }
        
        try {
            const portData = await apiRequest(`/api/projects/${projectId}/port`, {
                method: 'PUT',
                body: JSON.stringify({ port: newPort })
            });
            
            if (portData.success) {
                settingsUpdated = true;
            } else {
                // API'den gelen hatayı göster
                showToast(portData.error || 'Port güncellenemedi.', 'error');
                return; // Hata varsa diğer işlemlere devam etme
            }
        } catch (error) {
            console.error('Port update error:', error);
            showToast('Port güncellenirken bir sunucu hatası oluştu.', 'error');
            return;
        }
    }

    // İsim ve açıklama güncelleme mantığı
    if (newName !== currentProject.name || newDescription !== (currentProject.description || '')) {
        try {
            await apiRequest(`/api/projects/${projectId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: newName,
                    description: newDescription
                })
            });
            settingsUpdated = true;
        } catch (error) {
            console.error('Project info update error:', error);
            showToast('Proje bilgileri güncellenirken bir hata oluştu.', 'error');
            return;
        }
    }

    if (settingsUpdated) {
        settingsModal.hide();
        showToast('Proje ayarları başarıyla güncellendi.', 'success');
        loadProjects();
    } else {
        showToast('Değişiklik yapılmadı.', 'info');
    }
}

async function showProjectDetails(projectId) {
    try {
        const data = await apiRequest(`/api/projects/${projectId}`);
        if (data) {
            renderProjectModal(data);
            projectModal.show();
        }
    } catch (error) {
        console.error('Show project details error:', error);
    }
}

function renderProjectModal(project) {
    document.getElementById('projectModalTitle').textContent = project.name;
    
    const statusInfo = getStatusInfo(project.status);
    
    const content = `
        <div class="project-info">
            <h6>Proje Bilgileri</h6>
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Tür:</strong> ${project.type}</p>
                    <p><strong>Durum:</strong> <span class="badge bg-${statusInfo.class}">${statusInfo.text}</span></p>
                    <p><strong>Port:</strong> ${project.external_port || 'Atanmamış'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Yol:</strong> ${project.path}</p>
                    <p><strong>Oluşturulma:</strong> ${formatDate(project.created_at)}</p>
                    <p><strong>Güncelleme:</strong> ${formatDate(project.updated_at)}</p>
                </div>
            </div>
            <p><strong>Açıklama:</strong> ${project.description || 'Açıklama yok'}</p>
        </div>
        
        <div class="mb-3">
            <h6>İşlemler</h6>
            <div class="project-actions">
                <button class="btn btn-primary btn-sm me-2" onclick="deployProject(${project.id})">
                    <i class="fas fa-rocket"></i> Deploy
                </button>
                <button class="btn btn-success btn-sm me-2" onclick="startProject(${project.id})">
                    <i class="fas fa-play"></i> Başlat
                </button>
                <button class="btn btn-warning btn-sm me-2" onclick="stopProject(${project.id})">
                    <i class="fas fa-stop"></i> Durdur
                </button>
                <button class="btn btn-info btn-sm me-2" onclick="restartProject(${project.id})">
                    <i class="fas fa-sync-alt"></i> Yeniden Başlat
                </button>
                <button class="btn btn-outline-secondary btn-sm me-2" onclick="showProjectSettings(${project.id})">
                    <i class="fas fa-cog"></i> Ayarlar
                </button>
                <button class="btn btn-outline-danger btn-sm" onclick="deleteProject(${project.id})">
                    <i class="fas fa-trash"></i> Sil
                </button>
            </div>
        </div>
        
        <div class="deployment-history">
            <h6>Son Deploymentlar</h6>
            <div id="deploymentHistory">
                <div class="text-center">
                    <i class="fas fa-spinner fa-spin"></i> Yükleniyor...
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('projectModalContent').innerHTML = content;
    
    // Load deployment history
    loadDeploymentHistory(project.id);
}

async function loadDeploymentHistory(projectId) {
    try {
        const data = await apiRequest(`/api/deployments?projectId=${projectId}&limit=10`);
        if (data) {
            renderDeploymentHistory(data);
        }
    } catch (error) {
        console.error('Load deployment history error:', error);
    }
}

function renderDeploymentHistory(deployments) {
    const container = document.getElementById('deploymentHistory');
    
    if (deployments.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz deployment yok</p>';
        return;
    }
    
    const html = deployments.map(deployment => {
        const statusInfo = getDeploymentStatusInfo(deployment.status);
        return `
            <div class="deployment-item ${deployment.status}">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${statusInfo.text}</strong>
                        <small class="text-muted d-block">${formatDate(deployment.started_at)}</small>
                    </div>
                    <div>
                        <span class="badge bg-secondary">#${deployment.id}</span>
                    </div>
                </div>
                ${deployment.error_message ? `<div class="text-danger mt-2">${deployment.error_message}</div>` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Logs functions
async function showProjectLogs(projectId) {
    currentProjectId = projectId;
    
    const project = projects.find(p => p.id === projectId);
    document.getElementById('logsModalTitle').textContent = `${project.name} - Loglar`;
    
    // Set default active button
    document.querySelectorAll('[data-log-type]').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-log-type="all"]').classList.add('active');
    
    logsModal.show();
    loadLogs(projectId, 'all');
}

async function loadLogs(projectId, type = 'all') {
    const logsContent = document.getElementById('logsContent');
    logsContent.textContent = 'Loglar yükleniyor...';
    
    try {
        const url = type === 'all' 
            ? `/api/logs/project/${projectId}?limit=200`
            : `/api/logs/project/${projectId}?type=${type}&limit=200`;
            
        const data = await apiRequest(url);
        
        if (data) {
            renderLogs(data);
        }
    } catch (error) {
        console.error('Load logs error:', error);
    }
}

function renderLogs(logs) {
    const logsContent = document.getElementById('logsContent');
    
    if (logs.length === 0) {
        logsContent.textContent = 'Henüz log yok';
        return;
    }
    
    // Sort logs by timestamp
    logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    const logText = logs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString('tr-TR');
        return `[${timestamp}] [${log.type}] ${log.message}`;
    }).join('\n');
    
    logsContent.textContent = logText;
    
    // Auto scroll to bottom
    logsContent.scrollTop = logsContent.scrollHeight;
}

async function clearLogs() {
    if (!currentProjectId) return;
    
    if (confirm('Bu projenin tüm loglarını silmek istediğinizden emin misiniz?')) {
        try {
            const data = await apiRequest(`/api/logs/project/${currentProjectId}`, {
                method: 'DELETE'
            });
            
            if (data) {
                showToast('Loglar temizlendi', 'success');
                loadLogs(currentProjectId, 'all');
            }
        } catch (error) {
            console.error('Clear logs error:', error);
        }
    }
}

// WebSocket functions

// Bottom Log Panel Functions
function showBottomLogPanel(projectId) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    // Eski aboneliği iptal et
    if (activeBottomLogProject && activeBottomLogProject !== projectId) {
        unsubscribeFromProject();
    }
    
    activeBottomLogProject = projectId;
    bottomLogCount = 0;
    
    document.getElementById('logPanelTitle').textContent = `${project.name} - Canlı Loglar`;
    document.getElementById('logPanelCount').textContent = '0';
    document.getElementById('bottomLogsContent').innerHTML = '';
    
    const logPanel = document.getElementById('logPanel');
    logPanel.classList.add('expanded');
    
    const toggleIcon = document.getElementById('logPanelToggle');
    toggleIcon.className = 'fas fa-chevron-down';
    
    // WebSocket'e abone ol
    subscribeToProject(projectId);
}

function hideBottomLogPanel() {
    // Aboneliği iptal et
    if (activeBottomLogProject) {
        unsubscribeFromProject();
    }
    
    activeBottomLogProject = null;
    
    const logPanel = document.getElementById('logPanel');
    logPanel.classList.remove('expanded');
    
    const toggleIcon = document.getElementById('logPanelToggle');
    toggleIcon.className = 'fas fa-chevron-up';
}

function toggleLogPanel() {
    const logPanel = document.getElementById('logPanel');
    const toggleIcon = document.getElementById('logPanelToggle');
    
    if (logPanel.classList.contains('expanded')) {
        logPanel.classList.remove('expanded');
        toggleIcon.className = 'fas fa-chevron-up';
    } else {
        logPanel.classList.add('expanded');
        toggleIcon.className = 'fas fa-chevron-down';
    }
}

function appendToBottomLogs(data) {
    const logsContent = document.getElementById('bottomLogsContent');
    const timestamp = new Date(data.timestamp).toLocaleTimeString('tr-TR');
    
    // Renkli log mesajı oluştur
    const logLine = document.createElement('div');
    logLine.className = `log-${data.logType}`;
    logLine.textContent = `[${timestamp}] [${data.logType}] ${data.message}`;
    
    logsContent.appendChild(logLine);
    logsContent.scrollTop = logsContent.scrollHeight;
    
    bottomLogCount++;
    document.getElementById('logPanelCount').textContent = bottomLogCount;
}

function clearBottomLogs(event) {
    event.stopPropagation(); // Panel toggle'ı engellemek için
    
    document.getElementById('bottomLogsContent').innerHTML = '';
    bottomLogCount = 0;
    document.getElementById('logPanelCount').textContent = '0';
}

function handleLogMessage(data) {
    console.log('📨 Log mesajı alındı:', data);
    
    // If logs modal is open and matches current project, append log
    if (logsModal._isShown && currentProjectId == data.projectId) {
        const logsContent = document.getElementById('logsContent');
        const timestamp = new Date(data.timestamp).toLocaleTimeString('tr-TR');
        const logLine = `[${timestamp}] [${data.logType}] ${data.message}`;
        
        logsContent.textContent += '\n' + logLine;
        logsContent.scrollTop = logsContent.scrollHeight;
    }
    
    // Auto-open browser when project starts successfully (only for manual start - not during deployment)
    if (data.logType === 'system' && data.message && data.message.includes('Proje başlatıldı:') && activeBottomLogProject !== data.projectId) {
        // Extract port from message: "Proje başlatıldı: cizelge_deneme (Port: 5000)"
        const portMatch = data.message.match(/Port: (\d+)/);
        if (portMatch) {
            const port = portMatch[1];
            const url = `http://localhost:${port}`;
            setTimeout(() => {
                window.open(url, '_blank');
                showToast(`🚀 Proje açıldı: ${url}`, 'success');
            }, 2000); // 2 saniye bekle ki proje tamamen başlasın
        }
    }
    
    // Auto-open browser when deployment completes and project is accessible
    if (data.logType === 'system' && data.message && data.message.includes('🚀 Proje erişilebilir:')) {
        // Extract URL from message: "🚀 Proje erişilebilir: http://localhost:5000"
        const urlMatch = data.message.match(/http:\/\/localhost:(\d+)/);
        if (urlMatch) {
            const url = urlMatch[0];
            setTimeout(() => {
                window.open(url, '_blank');
                showToast(`🌐 Proje tarayıcıda açıldı: ${url}`, 'success');
            }, 1000); // 1 saniye bekle
        }
    }
    
    if (data.logType === 'system' && data.message) {
        if (data.message.includes('✅ Deployment')) {
            showToast(data.message, 'success');
            setTimeout(() => hideBottomLogPanel(), 5000);
        } else if (data.message.includes('❌ Deployment')) {
            showToast(data.message, 'error');
            setTimeout(() => hideBottomLogPanel(), 5000); // Hata mesajını okumak için daha uzun süre
        } else if (data.message.includes('🚀 Proje erişilebilir:')) {
            showToast(data.message, 'success');
        }
    }
    
    // Handle bottom log panel updates
    if (activeBottomLogProject == data.projectId) {
        console.log('➡️ Bottom log panel için mesaj:', data.message);
        appendToBottomLogs(data);
        
        // Hide panel if project stopped or errored
        if (data.logType === 'system' && 
            (data.message.includes('Proje durdu') || data.message.includes('Proje hatası'))) {
            setTimeout(() => {
                hideBottomLogPanel();
            }, 3000); // 3 saniye sonra gizle
        }
    } else {
        console.log('⚠️ Bottom log panel aktif değil veya farklı proje:', {
            activeBottomLogProject,
            dataProjectId: data.projectId,
            message: data.message
        });
    }
    
    // Update project status if needed
    if (data.logType === 'system') {
        setTimeout(loadProjects, 1000);
    }
}

// Project creation and upload functions
async function loadProjectTypes() {
    try {
        const data = await apiRequest('/api/projects/types');
        if (data) {
            projectTypes = data;
            populateProjectTypeSelect();
        }
    } catch (error) {
        console.error('Load project types error:', error);
    }
}

function populateProjectTypeSelect() {
    const select = document.getElementById('projectType');
    select.innerHTML = '<option value="">Proje türünü seçin</option>';
    
    projectTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.id;
        option.textContent = type.name;
        select.appendChild(option);
    });
}

function showCreateProjectModal() {
    // Reset form
    document.getElementById('createProjectForm').reset();
    document.getElementById('selectedProjectType').style.display = 'none';
    createProjectModal.show();
}

function showUploadProjectModal() {
    // Reset form
    document.getElementById('uploadProjectForm').reset();
    selectedFile = null; // Global değişkeni temizle
    document.getElementById('selectedFile').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('uploadProgress').style.display = 'none';
    uploadProjectModal.show();
}

function handleProjectTypeChange(e) {
    const selectedType = projectTypes.find(type => type.id === e.target.value);
    const infoDiv = document.getElementById('selectedProjectType');
    
    if (selectedType) {
        document.getElementById('projectTypeIcon').className = selectedType.icon + ' me-2';
        document.getElementById('projectTypeName').textContent = selectedType.name;
        document.getElementById('projectTypeDescription').textContent = selectedType.description;
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

async function handleCreateProject(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('projectName').value,
        type: document.getElementById('projectType').value,
        description: document.getElementById('projectDescription').value
    };
    
    try {
        const data = await apiRequest('/api/projects/create', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        if (data) {
            createProjectModal.hide();
            showToast('Proje başarıyla oluşturuldu', 'success');
            loadProjects();
        }
    } catch (error) {
        console.error('Create project error:', error);
        showToast('Proje oluşturma hatası', 'error');
    }
}

function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (isValidFile(file)) {
                setSelectedFile(file);
            } else {
                showToast('Geçersiz dosya türü. Sadece ZIP, RAR veya TAR.GZ dosyaları desteklenir.', 'error');
            }
        }
    });
    
    uploadArea.addEventListener('click', () => {
        document.getElementById('projectFile').click();
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && isValidFile(file)) {
        setSelectedFile(file);
    } else if (file) {
        showToast('Geçersiz dosya türü. Sadece ZIP, RAR veya TAR.GZ dosyaları desteklenir.', 'error');
        e.target.value = '';
        selectedFile = null; // Global değişkeni temizle
    }
}

function isValidFile(file) {
    const validTypes = [
        'application/zip', 
        'application/x-zip-compressed', 
        'application/x-rar-compressed',
        'application/octet-stream', // Bazı ZIP dosyaları bu MIME type ile gelir
        'application/x-compressed',
        'multipart/x-zip'
    ];
    const validExtensions = ['.zip', '.rar', '.tar.gz'];
    
    // MIME type kontrolü
    if (validTypes.includes(file.type)) {
        return true;
    }
    
    // Dosya uzantısı kontrolü
    if (validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
        return true;
    }
    
    // ZIP dosyası uzantısı varsa kabul et (MIME type yanlış olsa bile)
    if (file.name.toLowerCase().endsWith('.zip')) {
        return true;
    }
    
    return false;
}

function setSelectedFile(file) {
    selectedFile = file; // Global değişkende tut
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFile').style.display = 'block';
    document.getElementById('uploadArea').style.display = 'none';
}

function removeSelectedFile() {
    selectedFile = null; // Global değişkeni temizle
    document.getElementById('projectFile').value = '';
    document.getElementById('selectedFile').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
}

async function handleUploadProject(e) {
    e.preventDefault();
    
    const projectName = document.getElementById('uploadProjectName').value;
    const fileInput = document.getElementById('projectFile');
    const file = fileInput.files[0] || selectedFile; // Hem file input hem de drag & drop'u kontrol et
    
    if (!file) {
        showToast('Lütfen bir dosya seçin', 'error');
        return;
    }
    
    if (!projectName) {
        showToast('Lütfen proje adı girin', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('projectFile', file);
    formData.append('projectName', projectName);
    
    // Show progress
    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadSubmitBtn').disabled = true;
    
    try {
        const response = await fetch('/api/projects/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            uploadProjectModal.hide();
            showToast('Proje başarıyla yüklendi', 'success');
            loadProjects();
        } else {
            showToast(data.error || 'Proje yükleme hatası', 'error');
        }
    } catch (error) {
        console.error('Upload project error:', error);
        showToast('Proje yükleme hatası', 'error');
    } finally {
        // Hide progress
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadSubmitBtn').disabled = false;
    }
}

// Make functions globally accessible
window.switchView = switchView;
window.syncProjects = syncProjects;
window.deployProject = deployProject;
window.startProject = startProject;
window.stopProject = stopProject;
window.restartProject = restartProject;
window.showLogs = showProjectLogs;
window.showProjectLogs = showProjectLogs;
window.openProjectSettings = showProjectSettings;
window.showProjectSettings = showProjectSettings;
window.deleteProject = deleteProject;
window.showProjectDetails = showProjectDetails;
window.editPort = editPort;

// Auto refresh
setInterval(() => {
    loadProjects();
}, 30000); // Refresh every 30 seconds 

async function loadDashboardStats() {
    try {
        const projects = await apiRequest('/api/projects');
        if (projects) {
            document.getElementById('totalProjects').textContent = projects.length;
            document.getElementById('runningProjects').textContent = projects.filter(p => p.status === 'running').length;
        }
    } catch (error) {
        console.error('Dashboard stats error:', error);
    }
}