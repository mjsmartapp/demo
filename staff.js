import { db } from './firebase.js';
import { collection, query, where, getDocs, addDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentClass = '';
let currentSection = '';
let fetchedStudents = [];
let historyDocs = []; 

let isEditing = false;
let editingDocId = null;
let savedState = {}; 

window.addEventListener('load', () => {
    // Setup Custom Modal Listeners
    setupCustomModals();

    const userName = localStorage.getItem('ssvms_user');
    if (!userName) window.location.href = 'index.html';
    
    document.getElementById('welcome-msg').innerHTML = `Welcome, <span style="text-transform: capitalize;">${userName}</span>`;
    document.getElementById('attendanceDate').valueAsDate = new Date();
    populateClassGrid();

    setTimeout(() => {
        const loader = document.getElementById('loader-wrapper');
        if(loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 800);
});

// --- CUSTOM MODAL LOGIC ---
function setupCustomModals() {
    const alertModal = document.getElementById('custom-alert-modal');
    const confirmModal = document.getElementById('custom-confirm-modal');

    // Alert OK button
    document.getElementById('custom-alert-ok-btn').onclick = () => {
        alertModal.style.display = 'none';
    };

    // Confirm Cancel button
    document.getElementById('custom-confirm-cancel-btn').onclick = () => {
        confirmModal.style.display = 'none';
    };
}

window.showPopupAlert = function(title, message) {
    document.getElementById('custom-alert-title').innerText = title;
    document.getElementById('custom-alert-msg').innerHTML = message.replace(/\n/g, '<br>');
    document.getElementById('custom-alert-modal').style.display = 'flex';
}

window.showPopupConfirm = function(title, message, onConfirmCallback) {
    document.getElementById('custom-confirm-title').innerText = title;
    document.getElementById('custom-confirm-msg').innerHTML = message.replace(/\n/g, '<br>');
    const modal = document.getElementById('custom-confirm-modal');
    modal.style.display = 'flex';

    // Handle Yes Click (Remove old listener to prevent duplicates)
    const yesBtn = document.getElementById('custom-confirm-yes-btn');
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    newYesBtn.onclick = () => {
        modal.style.display = 'none';
        if (onConfirmCallback) onConfirmCallback();
    };
}

// --- HELPER: Navigation ---
window.switchView = function(viewId) {
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    // Show selected view
    document.getElementById(viewId).style.display = 'block';
    
    // Desktop Sidebar Active State
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    // Mobile Bottom Nav Active State
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));

    // Set Active Classes
    if(viewId === 'dashboard-view') {
        document.getElementById('nav-dashboard').classList.add('active');
        const mobNav = document.getElementById('mob-nav-dashboard');
        if(mobNav) mobNav.classList.add('active');
    }
    else if (viewId.includes('attendance')) {
        document.getElementById('nav-attendance').classList.add('active');
        const mobNav = document.getElementById('mob-nav-attendance');
        if(mobNav) mobNav.classList.add('active');
    }

    // Close sidebar on mobile selection
    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.overlay').classList.remove('active');
    }
}

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('active');
    document.querySelector('.overlay').classList.toggle('active');
}

window.handleLogout = function() {
    window.showPopupConfirm("Logout", "Are you sure you want to logout?", () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
}

// --- HELPER: Logic to determine which buttons are active based on status string ---
function getButtonState(statusStr) {
    let state = { pm: false, pa: false, pf: false, am: false, aa: false, af: false };
    
    if (statusStr === 'FDPR') {
        state.pm = true; state.pa = true; state.pf = true;
    } else if (statusStr === 'FDAB') {
        state.am = true; state.aa = true; state.af = true;
    } else if (statusStr === 'MPR') {
        state.pm = true; state.aa = true; 
    } else if (statusStr === 'APR') {
        state.am = true; state.pa = true; 
    }
    return state;
}

// --- CLASS & SECTION ---
function populateClassGrid() {
    const container = document.getElementById('classGrid');
    container.innerHTML = '';
    const classes = ['PRE-KG', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    classes.forEach(cls => {
        const div = document.createElement('div');
        div.className = 'class-card';
        div.innerHTML = `<i class="fas fa-book-reader"></i><h3>${cls}</h3><p>Standard</p>`;
        div.onclick = () => window.selectClass(cls);
        container.appendChild(div);
    });
}

window.selectClass = function(className) {
    currentClass = className;
    document.getElementById('section-title').innerText = `${className} Std - Select Section`;
    window.switchView('attendance-section-view');
}

window.selectSection = function(sectionName) {
    currentSection = sectionName;
    const title = `${currentClass} Std - Section ${currentSection}`;
    document.getElementById('hist-class-title').innerText = title;
    document.getElementById('att-class-sec-title').innerText = title;
    window.switchView('attendance-history-view');
    loadAttendanceHistory();
}

// --- HISTORY LOGIC ---
async function loadAttendanceHistory() {
    const listContainer = document.getElementById('historyList');
    listContainer.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Loading records...</p>';
    historyDocs = []; 

    try {
        const attRef = collection(db, "attendance");
        const q = query(
            attRef,
            where("studentClass", "==", currentClass),
            where("section", "==", currentSection)
        );
        
        const snap = await getDocs(q);
        listContainer.innerHTML = '';

        if (snap.empty) {
            listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#aaa;">No attendance records found for this section.</div>';
            return;
        }

        snap.forEach(doc => historyDocs.push({ id: doc.id, ...doc.data() }));
        historyDocs.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);

        historyDocs.forEach(data => {
            const fdPr = data.records.filter(r => r.status === 'FDPR').length;
            const fdAb = data.records.filter(r => r.status === 'FDAB').length;
            const adPr = data.records.filter(r => r.status === 'MPR' || r.status === 'APR').length;
            const adAb = data.records.filter(r => r.status === 'MPR' || r.status === 'APR').length;

            const card = document.createElement('div');
            card.className = 'history-card';
            card.onclick = () => window.viewDetails(data.id);
            
            card.innerHTML = `
                <div class="card-top">
                    <div>
                        <div class="history-date">${data.date}</div>
                        <div class="history-meta">Marked by: ${data.markedBy}</div>
                    </div>
                    <button class="edit-history-btn" title="Edit" onclick="event.stopPropagation(); window.editAttendance('${data.id}')">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </div>
                
                <div class="history-stats-grid">
                    <div class="stat-box sb-fd-pres">
                        <span>FD PRESENT</span> <span>${fdPr}</span>
                    </div>
                    <div class="stat-box sb-ad-pres">
                        <span>AD PRESENT</span> <span>${adPr}</span>
                    </div>
                    <div class="stat-box sb-fd-abs">
                        <span>FD ABSENT</span> <span>${fdAb}</span>
                    </div>
                    <div class="stat-box sb-ad-abs">
                        <span>AD ABSENT</span> <span>${adAb}</span>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });

    } catch (e) {
        console.error("History Load Error:", e);
        listContainer.innerHTML = '<div style="color:red; text-align:center;">Error loading history. Check console.</div>';
    }
}

// --- VIEW DETAILS MODAL ---
window.viewDetails = function(docId) {
    const record = historyDocs.find(d => d.id === docId);
    if(!record) return;

    const content = document.getElementById('viewModalContent');
    let html = `
        <div style="margin-bottom:15px; font-weight:600; color:#0f172a;">
            Date: ${record.date} <span style="float:right; color:#64748b; font-weight:400; font-size:0.8rem;">By: ${record.markedBy}</span>
        </div>
        <table class="view-table">
            <thead><tr><th>Name</th><th>ID</th><th>Status</th><th>Remark</th></tr></thead>
            <tbody>
    `;

    record.records.sort((a,b) => a.name.localeCompare(b.name));
    record.records.forEach(r => {
        let pillClass = 'pill-half';
        if(r.status === 'FDPR') pillClass = 'pill-present';
        if(r.status === 'FDAB') pillClass = 'pill-absent';
        
        html += `
            <tr>
                <td>${r.name}</td>
                <td>${r.customId}</td>
                <td><span class="status-pill ${pillClass}">${r.status}</span></td>
                <td style="color:#666;">${r.remarks || '-'}</td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    
    content.innerHTML = html;
    document.getElementById('viewModal').style.display = 'flex';
}

// --- EDIT LOGIC ---
window.editAttendance = function(docId) {
    const record = historyDocs.find(d => d.id === docId);
    if(!record) return;

    isEditing = true;
    editingDocId = docId;
    savedState = {}; 
    
    record.records.forEach(r => {
        savedState[r.studentId] = { status: r.status, remarks: r.remarks };
    });

    fetchedStudents = record.records.map(r => ({
        id: r.studentId,
        customId: r.customId,
        name: r.name
    }));
    
    document.getElementById('attendanceDate').value = record.date;
    document.getElementById('form-header-title').innerText = "Edit Attendance";
    document.getElementById('btnSubmitAttendance').innerHTML = '<i class="fas fa-save"></i> Update Attendance';

    window.switchView('attendance-entry-view');
    renderAttendanceList();
}

window.openMarkAttendance = function() {
    window.switchView('attendance-entry-view');
    document.getElementById('attendanceDate').valueAsDate = new Date();
    window.checkExistingAttendance(); 
}

window.checkExistingAttendance = async function() {
    const selectedDate = document.getElementById('attendanceDate').value;
    if (!selectedDate) return;

    const existingRecord = historyDocs.find(d => d.date === selectedDate);

    if (existingRecord) {
        window.editAttendance(existingRecord.id);
        window.showPopupAlert("Notification", `Attendance for ${selectedDate} already exists.\nSwitched to Edit Mode.`);
    } else {
        isEditing = false;
        editingDocId = null;
        savedState = {};
        document.getElementById('form-header-title').innerText = "Mark Attendance";
        document.getElementById('btnSubmitAttendance').innerHTML = '<i class="fas fa-save"></i> Save Attendance';
        fetchStudentsAndRender();
    }
}

async function fetchStudentsAndRender() {
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading-text"><i class="fas fa-spinner fa-spin"></i> Fetching students...</td></tr>';
    document.getElementById('student-count').innerText = '...';
    fetchedStudents = [];

    try {
        const usersRef = collection(db, "users");
        const q = query(
            usersRef, 
            where("role", "==", "student"), 
            where("studentClass", "==", currentClass), 
            where("section", "==", currentSection)
        );

        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            fetchedStudents.push({ id: doc.id, ...doc.data() });
        });

        fetchedStudents.sort((a, b) => a.name.localeCompare(b.name));
        renderAttendanceList();

    } catch (e) {
        console.error("Error fetching students:", e);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading students.</td></tr>';
    }
}

function renderAttendanceList() {
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';
    document.getElementById('student-count').innerText = fetchedStudents.length;

    if(fetchedStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No students found in this class.</td></tr>';
        return;
    }

    let defaultStatus = 'FDPR';
    if (!isEditing) {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        if (currentMins >= 360 && currentMins <= 760) defaultStatus = 'MPR';
        else if (currentMins > 760 && currentMins <= 1020) defaultStatus = 'APR';
    }

    fetchedStudents.forEach((student) => {
        const displayId = student.customId || "N/A";
        
        let currentStatus;
        let currentRemark = '';

        if (isEditing) {
            const saved = savedState[student.id];
            currentStatus = saved ? saved.status : 'FDAB'; 
            currentRemark = saved ? saved.remarks : '';
        } else {
            currentStatus = defaultStatus;
        }

        const state = getButtonState(currentStatus);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="center-cell" style="color:#64748b; font-size:0.9rem;">${displayId}</td>
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="section-avatar" style="width:32px; height:32px; font-size:0.9rem; background:#f1f5f9; color:#475569;">
                        ${student.name.charAt(0)}
                    </div>
                    <strong>${student.name}</strong>
                </div>
            </td>
            <td class="center-cell">
                <div class="status-group" id="present_group_${student.id}">
                    <button class="circle-btn btn-present ${state.pm ? 'active' : ''}" data-val="MPR" title="Morning Present" onclick="window.setStatus(this, '${student.id}', 'P', 'M')">M</button>
                    <button class="circle-btn btn-present ${state.pa ? 'active' : ''}" data-val="APR" title="Afternoon Present" onclick="window.setStatus(this, '${student.id}', 'P', 'A')">A</button>
                    <button class="circle-btn btn-present ${state.pf ? 'active' : ''}" data-val="FDPR" title="Full Day Present" onclick="window.setStatus(this, '${student.id}', 'P', 'F')">F</button>
                </div>
            </td>
            <td class="center-cell">
                <div class="status-group" id="absent_group_${student.id}">
                    <button class="circle-btn btn-absent ${state.am ? 'active' : ''}" data-val="MAB" title="Morning Absent" onclick="window.setStatus(this, '${student.id}', 'A', 'M')">M</button>
                    <button class="circle-btn btn-absent ${state.aa ? 'active' : ''}" data-val="AAB" title="Afternoon Absent" onclick="window.setStatus(this, '${student.id}', 'A', 'A')">A</button>
                    <button class="circle-btn btn-absent ${state.af ? 'active' : ''}" data-val="FDAB" title="Full Day Absent" onclick="window.setStatus(this, '${student.id}', 'A', 'F')">F</button>
                </div>
            </td>
            <td>
                <input type="text" id="remark_${student.id}" class="remark-input" placeholder="Optional..." value="${currentRemark}">
                <input type="hidden" id="status_input_${student.id}" value="${currentStatus}">
            </td>
        `;
        tbody.appendChild(row);
    });
}

// --- TOGGLE LOGIC ---
window.setStatus = function(btn, studentId, type, slot) {
    const pGroup = document.getElementById(`present_group_${studentId}`);
    const aGroup = document.getElementById(`absent_group_${studentId}`);
    
    const btnPM = pGroup.querySelector('[data-val="MPR"]');
    const btnPA = pGroup.querySelector('[data-val="APR"]');
    const btnPF = pGroup.querySelector('[data-val="FDPR"]');
    
    const btnAM = aGroup.querySelector('[data-val="MAB"]');
    const btnAA = aGroup.querySelector('[data-val="AAB"]');
    const btnAF = aGroup.querySelector('[data-val="FDAB"]');

    btn.classList.add('active');

    if (type === 'P') { 
        if (slot === 'M') btnAM.classList.remove('active'); 
        else if (slot === 'A') btnAA.classList.remove('active'); 
        else if (slot === 'F') {
            btnPM.classList.add('active'); btnPA.classList.add('active');
            btnAM.classList.remove('active'); btnAA.classList.remove('active'); btnAF.classList.remove('active');
        }
    } else { 
        if (slot === 'M') btnPM.classList.remove('active'); 
        else if (slot === 'A') btnPA.classList.remove('active'); 
        else if (slot === 'F') {
            btnAM.classList.add('active'); btnAA.classList.add('active');
            btnPM.classList.remove('active'); btnPA.classList.remove('active'); btnPF.classList.remove('active');
        }
    }

    if (btnPM.classList.contains('active') && btnPA.classList.contains('active')) btnPF.classList.add('active');
    else btnPF.classList.remove('active');

    if (btnAM.classList.contains('active') && btnAA.classList.contains('active')) btnAF.classList.add('active');
    else btnAF.classList.remove('active');

    let finalStatus = '';
    const isPM = btnPM.classList.contains('active');
    const isPA = btnPA.classList.contains('active');
    const isAM = btnAM.classList.contains('active');
    const isAA = btnAA.classList.contains('active');

    if (isPM && isPA) finalStatus = 'FDPR';
    else if (isAM && isAA) finalStatus = 'FDAB';
    else if (isPM) finalStatus = 'MPR';
    else if (isPA) finalStatus = 'APR';
    else finalStatus = 'FDAB';

    document.getElementById(`status_input_${studentId}`).value = finalStatus;
}

window.markAll = function(statusValue) {
    fetchedStudents.forEach(st => {
        let groupType = (statusValue.includes('PR')) ? 'present' : 'absent';
        const group = document.getElementById(`${groupType}_group_${st.id}`);
        const targetBtn = group.querySelector(`.circle-btn[data-val="${statusValue}"]`);
        if(targetBtn) targetBtn.click();
    });
}

const btnSubmit = document.getElementById('btnSubmitAttendance');
if(btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
        if(fetchedStudents.length === 0) return;

        const date = document.getElementById('attendanceDate').value;
        if(!date) { window.showPopupAlert("Error", "Please select a date."); return; }

        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btnSubmit.disabled = true;

        const records = fetchedStudents.map(student => {
            const status = document.getElementById(`status_input_${student.id}`).value;
            const remark = document.getElementById(`remark_${student.id}`).value;

            return {
                studentId: student.id,
                customId: student.customId || '',
                name: student.name,
                status: status,
                remarks: remark
            };
        });

        const attendanceDoc = {
            date: date,
            studentClass: currentClass,
            section: currentSection,
            timestamp: new Date(),
            markedBy: localStorage.getItem('ssvms_user') || 'Staff',
            records: records
        };

        try {
            if (isEditing && editingDocId) {
                const docRef = doc(db, "attendance", editingDocId);
                await updateDoc(docRef, attendanceDoc);
                window.showPopupAlert("Success", `Attendance Updated successfully for ${date}!`);
            } else {
                await addDoc(collection(db, "attendance"), attendanceDoc);
                window.showPopupAlert("Success", `Attendance Saved successfully for ${date}!`);
            }
            
            window.switchView('attendance-history-view');
            loadAttendanceHistory(); 
        } catch (e) {
            console.error("Save Error:", e);
            window.showPopupAlert("Error", "Error saving attendance: " + e.message);
        } finally {
            btnSubmit.innerHTML = '<i class="fas fa-save"></i> Save Attendance';
            btnSubmit.disabled = false;
        }
    });
}