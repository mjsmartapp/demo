import { db } from './firebase.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

window.addEventListener('load', async () => {
    const userRole = localStorage.getItem('ssvms_role');
    const loginId = localStorage.getItem('ssvms_email');
    
    if (!userRole || userRole !== 'student') {
        window.location.href = 'index.html';
        return;
    }

    const selectedProfileId = localStorage.getItem('ssvms_student_profile_id');

    if (!selectedProfileId && loginId) {
        // Multi-User Check Logic
        try {
            const usersRef = collection(db, "users");
            const qEmail = query(usersRef, where("email", "==", loginId), where("role", "==", "student"));
            const qPhone = query(usersRef, where("phone", "==", loginId), where("role", "==", "student"));
            const [snapEmail, snapPhone] = await Promise.all([getDocs(qEmail), getDocs(qPhone)]);
            
            const studentsMap = new Map();
            snapEmail.forEach(doc => studentsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            snapPhone.forEach(doc => studentsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            const students = Array.from(studentsMap.values());

            if (students.length > 1) {
                showProfileSelectionModal(students);
                const loader = document.getElementById('loader-wrapper');
                if (loader) { loader.style.opacity = '0'; loader.style.display = 'none'; }
                return;
            } else if (students.length === 1) {
                selectStudentProfile(students[0]);
            }
        } catch (error) {
            console.error("Error fetching profiles:", error);
        }
    } else {
        updateDashboardUI();
        fetchAttendanceStats(); 
        loadUserProfile(); // Fetch profile data on load
    }

    setTimeout(() => {
        const loader = document.getElementById('loader-wrapper');
        if(loader && loader.style.display !== 'none') {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 800);
});

// --- NAVIGATION ---
window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    if(viewId === 'dashboard-view') document.getElementById('nav-dashboard').classList.add('active');
    else if(viewId === 'attendance-view') document.getElementById('nav-attendance').classList.add('active');
    else if(viewId === 'profile-view') document.getElementById('nav-profile').classList.add('active');

    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.overlay').classList.remove('active');
    }
}

// --- PROFILE DATA LOGIC ---
async function loadUserProfile() {
    const profileId = localStorage.getItem('ssvms_student_profile_id');
    if(!profileId) return;

    try {
        const docRef = doc(db, "users", profileId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Populate DOM
            const nameEl = document.getElementById('prof-name');
            if(nameEl) nameEl.innerText = data.name;
            
            const idEl = document.getElementById('prof-custom-id');
            if(idEl) idEl.innerText = data.customId || 'N/A';
            
            const classEl = document.getElementById('prof-class-sec');
            if(classEl) classEl.innerText = `${data.studentClass || '-'} - ${data.section || '-'}`;
            
            const dobEl = document.getElementById('prof-dob');
            if(dobEl) dobEl.innerText = data.dob || '--/--/----';
            
            const phoneEl = document.getElementById('prof-phone');
            if(phoneEl) phoneEl.innerText = data.phone || 'N/A';
            
            const emailEl = document.getElementById('prof-email');
            if(emailEl) emailEl.innerText = data.email || 'N/A';
        }
    } catch(e) {
        console.error("Profile Load Error", e);
    }
}

// --- ATTENDANCE CALCULATION LOGIC ---
async function fetchAttendanceStats() {
    const studentId = localStorage.getItem('ssvms_student_profile_id');
    const studentClass = localStorage.getItem('ssvms_student_class');
    const studentSection = localStorage.getItem('ssvms_student_section');

    if (!studentId || !studentClass || !studentSection) return;

    try {
        const attRef = collection(db, "attendance");
        const q = query(
            attRef,
            where("studentClass", "==", studentClass),
            where("section", "==", studentSection)
        );

        const snap = await getDocs(q);
        
        let totalDays = 0;
        let totalPresent = 0;
        let totalAbsent = 0;

        snap.forEach(doc => {
            const data = doc.data();
            const myRecord = data.records.find(r => r.studentId === studentId);
            
            if (myRecord) {
                totalDays++;
                const status = myRecord.status;
                
                if (status === 'FDPR') {
                    totalPresent += 1;
                } else if (status === 'FDAB') {
                    totalAbsent += 1;
                } else if (status === 'MPR' || status === 'APR') {
                    totalPresent += 0.5;
                    totalAbsent += 0.5;
                }
            }
        });

        // Calculate Percentage
        let percentage = 0;
        if (totalDays > 0) {
            percentage = (totalPresent / totalDays) * 100;
        }
        const pctFixed = percentage.toFixed(1);

        // Determine Status
        let statusText = "BAD";
        let statusClass = "status-bad";

        if (percentage > 90) { statusText = "VERY EXCELLENT"; statusClass = "status-excellent"; }
        else if (percentage > 85) { statusText = "VERY GOOD"; statusClass = "status-vgood"; }
        else if (percentage > 75) { statusText = "GOOD"; statusClass = "status-good"; }
        else if (percentage > 65) { statusText = "BORDER"; statusClass = "status-border"; }

        // Update UI
        document.getElementById('dash-att-pct').innerText = `${Math.round(percentage)}%`;
        
        // Detailed View
        document.getElementById('att-total-days').innerText = totalDays;
        document.getElementById('att-total-present').innerText = totalPresent;
        document.getElementById('att-total-absent').innerText = totalAbsent;
        document.getElementById('att-percentage').innerText = `${pctFixed}%`;
        
        const statusEl = document.getElementById('att-status-text');
        statusEl.innerText = statusText;
        statusEl.className = `sub ${statusClass}`;

    } catch (e) {
        console.error("Stats Error:", e);
    }
}

// --- PROFILE MODAL LOGIC (Login Flow) ---
function showProfileSelectionModal(students) {
    const modal = document.getElementById('profile-select-modal');
    const list = document.getElementById('profile-list');
    list.innerHTML = ''; 

    students.forEach(student => {
        const div = document.createElement('div');
        div.className = 'profile-card';
        div.innerHTML = `
            <div class="profile-avatar"><i class="fas fa-user-graduate"></i></div>
            <div class="profile-name">${student.name}</div>
            <div class="profile-class">${student.studentClass} - ${student.section}</div>
            <div class="profile-dob"><i class="fas fa-birthday-cake"></i> ${student.dob || 'N/A'}</div>
        `;
        div.onclick = () => selectStudentProfile(student);
        list.appendChild(div);
    });
    modal.style.display = 'flex';
}

window.selectStudentProfile = function(student) {
    localStorage.setItem('ssvms_student_profile_id', student.id);
    localStorage.setItem('ssvms_user', student.name);
    localStorage.setItem('ssvms_student_class', student.studentClass);
    localStorage.setItem('ssvms_student_section', student.section);
    document.getElementById('profile-select-modal').style.display = 'none';
    
    updateDashboardUI();
    fetchAttendanceStats();
    loadUserProfile();
}

function updateDashboardUI() {
    const userName = localStorage.getItem('ssvms_user');
    const userClass = localStorage.getItem('ssvms_student_class');
    const userSection = localStorage.getItem('ssvms_student_section');

    if(userName) {
        document.getElementById('welcome-msg').innerHTML = `Welcome, <span style="text-transform: capitalize;">${userName}</span>`;
    }
    if(userClass && userSection) {
        const dashEl = document.getElementById('dash-class-sec');
        if(dashEl) dashEl.innerText = `${userClass} - ${userSection}`;
    }
}

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('active');
    document.querySelector('.overlay').classList.toggle('active');
}

window.handleLogout = function() {
    if(confirm("Logout?")) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
}