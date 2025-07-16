// Global variables
let projects = [];
let ws = null;
let currentProjectId = null;
let projectTypes = [];
let selectedFile = null; // Drag & drop ile seçilen dosyayı tutacak
let bottomLogCount = 0;
let activeBottomLogProject = null;

// DOM elements
const projectModal = new bootstrap.Modal(document.getElementById('projectModal'));
const logsModal = new bootstrap.Modal(document.getElementById('logsModal'));
const createProjectModal = new bootstrap.Modal(document.getElementById('createProjectModal'));
const uploadProjectModal = new bootstrap.Modal(document.getElementById('uploadProjectModal'));
const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
const toast = new bootstrap.Toast(document.getElementById('toast'));

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Directly show main content and load projects
    showMainContent();
    loadProjects();
    loadProjectTypes();
    connectWebSocket();

    // Event listeners
    setupEventListeners();
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
        const data = await apiRequest('/api/projects');
        if (data) {
            projects = data;
            renderProjects();
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



function renderProjects() {
    const tbody = document.getElementById('projectsTable');
    
    if (projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>Henüz proje bulunamadı</p>
                    <button class="btn btn-primary" onclick="syncProjects()">
                        <i class="fas fa-sync me-2"></i>Projeleri Tara
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = projects.map(project => `
        <tr>
            <td>
                <strong>${project.name}</strong>
                <br>
                <small class="text-muted">${project.description || 'Açıklama yok'}</small>
            </td>
            <td>
                <span class="badge bg-secondary">${project.type}</span>
            </td>
            <td>
                <span class="badge status-badge status-${project.status}">
                    ${getStatusText(project.status)}
                </span>
            </td>
            <td>
                ${project.external_port ? `
                    <span class="badge bg-info port-badge" id="port-${project.id}">${project.external_port}</span>
                    <button class="btn btn-sm btn-outline-secondary ms-1" onclick="editPort(${project.id}, ${project.external_port}, '${project.status}')" title="Port Değiştir">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${project.status === 'running' ? `
                        <br><a href="http://localhost:${project.external_port}" target="_blank" class="btn btn-sm btn-outline-primary mt-1">
                            <i class="fas fa-external-link-alt me-1"></i>Aç
                        </a>
                    ` : ''}
                ` : '<span class="text-muted">Port yok</span>'}
            </td>
            <td>
                <small class="text-muted">${formatDate(project.updated_at)}</small>
            </td>
            <td class="project-actions">
                ${renderProjectActions(project)}
            </td>
        </tr>
    `).join('');
}

function renderProjectActions(project) {
    const actions = [];
    
    if (project.status === 'stopped') {
        actions.push(`<button class="btn btn-success btn-sm" onclick="startProject(${project.id})">
            <i class="fas fa-play"></i> Başlat
        </button>`);
        
        actions.push(`<button class="btn btn-primary btn-sm" onclick="deployProject(${project.id})">
            <i class="fas fa-rocket"></i> Deploy
        </button>`);
    } else if (project.status === 'running') {
        actions.push(`<button class="btn btn-warning btn-sm" onclick="stopProject(${project.id})">
            <i class="fas fa-stop"></i> Durdur
        </button>`);
        
        actions.push(`<button class="btn btn-info btn-sm" onclick="restartProject(${project.id})">
            <i class="fas fa-redo"></i> Restart
        </button>`);
    }
    
    actions.push(`<button class="btn btn-outline-primary btn-sm" onclick="showProjectSettings(${project.id})">
        <i class="fas fa-cog"></i> Ayarlar
    </button>`);
    
    actions.push(`<button class="btn btn-outline-secondary btn-sm" onclick="showProjectLogs(${project.id})">
        <i class="fas fa-terminal"></i> Loglar
    </button>`);
    
    return actions.join(' ');
}

function getStatusText(status) {
    const statusMap = {
        'running': 'Çalışıyor',
        'stopped': 'Durduruldu',
        'error': 'Hata',
        'building': 'Build Ediliyor',
        'pending': 'Bekliyor'
    };
    
    return statusMap[status] || status;
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
    loadDeploymentStats();
}

async function loadDeploymentStats() {
    try {
        const data = await apiRequest('/api/deployments?limit=100');
        if (data) {
            document.getElementById('totalDeployments').textContent = data.length;
        }
    } catch (error) {
        console.error('Load deployment stats error:', error);
    }
}

// Project actions
async function startProject(projectId) {
    try {
        // Loading state için button'ı disable et
        const startBtn = document.querySelector(`[onclick="startProject(${projectId})"]`);
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Başlatılıyor...';
        }
        
        const data = await apiRequest(`/api/deployments/start/${projectId}`, {
            method: 'POST'
        });
        
        if (data) {
            showToast('Proje başlatılıyor...', 'info');
            setTimeout(loadProjects, 1000); // 1 saniye sonra yenile
        }
    } catch (error) {
        console.error('Start project error:', error);
        showToast('Proje başlatılamadı', 'error');
    } finally {
        // Button'ı normal haline döndür
        setTimeout(() => {
            loadProjects();
        }, 2000);
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
            showToast('Deployment başlatıldı', 'success');
            loadProjects();
        }
    } catch (error) {
        console.error('Deploy project error:', error);
    }
}

// Port değiştirme fonksiyonu
async function editPort(projectId, currentPort, status) {
    let message = `Yeni port numarası girin (Mevcut: ${currentPort})\n\nPort 1024-65535 arasında olmalıdır:`;
    
    if (status === 'running') {
        message += '\n\n⚠️ Proje çalışıyor. Port değişikliği için proje yeniden başlatılacak.';
    }
    
    const newPort = prompt(message, currentPort);
    
    if (newPort === null) return; // İptal edildi
    
    const port = parseInt(newPort);
    
    if (isNaN(port) || port < 1024 || port > 65535) {
        showToast('Geçersiz port numarası. Port 1024-65535 arasında olmalıdır.', 'error');
        return;
    }
    
    try {
        // Eğer proje çalışıyorsa önce durdur
        if (status === 'running') {
            showToast('Proje durduruluyor...', 'info');
            await apiRequest(`/api/deployments/stop/${projectId}`, {
                method: 'POST'
            });
            
            // Biraz bekle ki proje düzgün dursun
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        const data = await apiRequest(`/api/projects/${projectId}/port`, {
            method: 'PUT',
            body: JSON.stringify({ port })
        });
        
        if (data) {
            showToast(`Port ${port} olarak güncellendi`, 'success');
            loadProjects();
            
            // Eğer proje çalışıyordu, yeniden başlat
            if (status === 'running') {
                showToast('Proje yeni port ile başlatılıyor...', 'info');
                setTimeout(async () => {
                    await apiRequest(`/api/deployments/start/${projectId}`, {
                        method: 'POST'
                    });
                }, 3000);
            }
        }
    } catch (error) {
        console.error('Port update error:', error);
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
            statusBadge.textContent = getStatusText(data.status);
            statusBadge.className = `badge status-badge status-${data.status}`;
            
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
    const newPort = parseInt(document.getElementById('settingsProjectPort').value);
    
    try {
        // Port değişikliği varsa
        const currentProject = projects.find(p => p.id == projectId);
        if (currentProject && currentProject.external_port !== newPort) {
            await editPort(projectId, currentProject.external_port, projectStatus);
        }
        
        // Proje bilgilerini güncelle (name, description)
        await apiRequest(`/api/projects/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: newName,
                description: newDescription
            })
        });
        
        settingsModal.hide();
        showToast('Proje ayarları güncellendi', 'success');
        loadProjects();
        
    } catch (error) {
        console.error('Save settings error:', error);
        showToast('Ayarlar güncellenirken hata oluştu', 'error');
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
    
    const content = `
        <div class="project-info">
            <h6>Proje Bilgileri</h6>
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Tür:</strong> ${project.type}</p>
                    <p><strong>Durum:</strong> <span class="badge status-${project.status}">${getStatusText(project.status)}</span></p>
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
                ${renderProjectActions(project)}
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
    
    const html = deployments.map(deployment => `
        <div class="deployment-item ${deployment.status}">
            <div class="d-flex justify-content-between">
                <div>
                    <strong>${getStatusText(deployment.status)}</strong>
                    <small class="text-muted d-block">${formatDate(deployment.started_at)}</small>
                </div>
                <div>
                    <span class="badge bg-secondary">#${deployment.id}</span>
                </div>
            </div>
            ${deployment.error_message ? `<div class="text-danger mt-2">${deployment.error_message}</div>` : ''}
        </div>
    `).join('');
    
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
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('WebSocket connected');
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            if (data.type === 'log') {
                handleLogMessage(data);
            }
        };
        
        ws.onclose = function() {
            console.log('WebSocket disconnected');
            // Reconnect after 3 seconds
            setTimeout(connectWebSocket, 3000);
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.error('WebSocket connection error:', error);
    }
}

// Bottom Log Panel Functions
function showBottomLogPanel(projectId) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    activeBottomLogProject = projectId;
    bottomLogCount = 0;
    
    document.getElementById('logPanelTitle').textContent = `${project.name} - Canlı Loglar`;
    document.getElementById('logPanelCount').textContent = '0';
    document.getElementById('bottomLogsContent').textContent = '';
    
    const logPanel = document.getElementById('logPanel');
    logPanel.classList.add('expanded');
    
    const toggleIcon = document.getElementById('logPanelToggle');
    toggleIcon.className = 'fas fa-chevron-down';
}

function hideBottomLogPanel() {
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
    
    // Color-coded log types
    let coloredMessage = '';
    switch(data.logType) {
        case 'stdout':
            coloredMessage = `\x1b[32m[${timestamp}] [${data.logType}] ${data.message}\x1b[0m`; // Green
            break;
        case 'stderr':
            coloredMessage = `\x1b[31m[${timestamp}] [${data.logType}] ${data.message}\x1b[0m`; // Red
            break;
        case 'system':
            coloredMessage = `\x1b[36m[${timestamp}] [${data.logType}] ${data.message}\x1b[0m`; // Cyan
            break;
        case 'build':
            coloredMessage = `\x1b[33m[${timestamp}] [${data.logType}] ${data.message}\x1b[0m`; // Yellow
            break;
        default:
            coloredMessage = `[${timestamp}] [${data.logType}] ${data.message}`;
    }
    
    logsContent.textContent += (logsContent.textContent ? '\n' : '') + coloredMessage;
    logsContent.scrollTop = logsContent.scrollHeight;
    
    bottomLogCount++;
    document.getElementById('logPanelCount').textContent = bottomLogCount;
}

function clearBottomLogs(event) {
    event.stopPropagation(); // Panel toggle'ı engellemek için
    
    document.getElementById('bottomLogsContent').textContent = '';
    bottomLogCount = 0;
    document.getElementById('logPanelCount').textContent = '0';
}

function handleLogMessage(data) {
    // If logs modal is open and matches current project, append log
    if (logsModal._isShown && currentProjectId == data.projectId) {
        const logsContent = document.getElementById('logsContent');
        const timestamp = new Date(data.timestamp).toLocaleTimeString('tr-TR');
        const logLine = `[${timestamp}] [${data.logType}] ${data.message}`;
        
        logsContent.textContent += '\n' + logLine;
        logsContent.scrollTop = logsContent.scrollHeight;
    }
    
    // Auto-open browser when project starts successfully
    if (data.logType === 'system' && data.message && data.message.includes('Proje başlatıldı:')) {
        // Extract project info and auto-open browser
        const project = projects.find(p => p.id == data.projectId);
        if (project && project.external_port) {
            const url = `http://localhost:${project.external_port}`;
            setTimeout(() => {
                window.open(url, '_blank');
                showToast(`🚀 Proje açıldı: ${url}`, 'success');
            }, 2000); // 2 saniye bekle ki proje tamamen başlasın
        }
        
        // Auto-show bottom log panel for this project
        showBottomLogPanel(data.projectId);
    }
    
    // Handle bottom log panel updates
    if (activeBottomLogProject == data.projectId) {
        appendToBottomLogs(data);
        
        // Hide panel if project stopped or errored
        if (data.logType === 'system' && 
            (data.message.includes('Proje durdu') || data.message.includes('Proje hatası'))) {
            setTimeout(() => {
                hideBottomLogPanel();
            }, 3000); // 3 saniye sonra gizle
        }
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

// Auto refresh
setInterval(() => {
    loadProjects();
}, 30000); // Refresh every 30 seconds 