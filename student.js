import { db } from './firebase.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentStudentCustomId = null; // Store custom ID for history query
let currentStudentName = null;
let currentHistoryData = [];

window.addEventListener('load', async () => {
    // Setup Custom Modal Listeners
    setupCustomModals();

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

// --- CUSTOM MODAL LOGIC ---
function setupCustomModals() {
    const alertModal = document.getElementById('custom-alert-modal');
    const confirmModal = document.getElementById('custom-confirm-modal');

    // Alert OK button
    const alertOk = document.getElementById('custom-alert-ok-btn');
    if(alertOk) {
        alertOk.onclick = () => {
            alertModal.style.display = 'none';
        };
    }

    // Confirm Cancel button
    const confirmCancel = document.getElementById('custom-confirm-cancel-btn');
    if(confirmCancel) {
        confirmCancel.onclick = () => {
            confirmModal.style.display = 'none';
        };
    }
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

// --- NAVIGATION ---
window.switchView = function(viewId) {
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    // Show selected view
    document.getElementById(viewId).style.display = 'block';
    
    // Desktop Sidebar Active State
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    // Mobile Bottom Nav Active State
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));

    // Set Active Classes based on View ID
    if(viewId === 'dashboard-view') {
        document.getElementById('nav-dashboard').classList.add('active');
        const mobNav = document.getElementById('mob-nav-dashboard');
        if(mobNav) mobNav.classList.add('active');
    }
    else if(viewId === 'attendance-view') {
        document.getElementById('nav-attendance').classList.add('active');
        const mobNav = document.getElementById('mob-nav-attendance');
        if(mobNav) mobNav.classList.add('active');
    }
    else if(viewId === 'profile-view') {
        document.getElementById('nav-profile').classList.add('active');
        const mobNav = document.getElementById('mob-nav-profile');
        if(mobNav) mobNav.classList.add('active');
    }

    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.overlay').classList.remove('active');
    }
}

// --- PROFILE & FEES DATA LOGIC ---
async function loadUserProfile() {
    const profileId = localStorage.getItem('ssvms_student_profile_id');
    if(!profileId) return;

    try {
        // 1. Fetch Student Data
        const docRef = doc(db, "users", profileId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Store Globals
            currentStudentCustomId = data.customId;
            currentStudentName = data.name;

            // --- Populate Basic Profile ---
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

            const placeEl = document.getElementById('prof-place');
            if(placeEl) placeEl.innerText = data.place || 'N/A';

            const pinEl = document.getElementById('prof-pincode');
            if(pinEl) pinEl.innerText = data.pincode || 'N/A';

            // --- FEES CALCULATION ---
            // Calculate "Fixed" (Standard) Fees
            let fixedAcademicFee = 'Not Set';
            let fixedVanMonthly = 'Not Set';
            let fixedVanTotal = 'Not Set';

            // A. Calculate Fixed Academic Fee (Standard)
            if (data.studentClass) {
                const feesRef = collection(db, "class_fees");
                const q = query(feesRef, where("class", "==", data.studentClass));
                const feeSnap = await getDocs(q);
                
                if(!feeSnap.empty) {
                    let fees = [];
                    feeSnap.forEach(d => fees.push(d.data()));
                    // Try exact section match
                    let match = fees.find(f => f.section === data.section);
                    // If no match, try generic or latest
                    if (!match) {
                        fees.sort((a,b) => (a.year > b.year ? -1 : 1)); 
                        match = fees[0]; 
                    }
                    if(match && match.amount) fixedAcademicFee = match.amount;
                }
            }

            // B. Calculate Fixed Van Fee (Standard)
            if (data.pincode && data.place) {
                const vanRef = collection(db, "van_fees");
                const q = query(vanRef, where("pincode", "==", data.pincode));
                const vanSnap = await getDocs(q);
                
                if(!vanSnap.empty) {
                    const recs = [];
                    vanSnap.forEach(d => recs.push(d.data()));
                    // Match Place Case-Insensitively
                    const matches = recs.filter(r => r.place && r.place.toLowerCase() === data.place.toLowerCase());
                    if (matches.length > 0) {
                        matches.sort((a,b) => (a.year > b.year ? -1 : 1));
                        const match = matches[0];
                        fixedVanMonthly = match.amount;
                        
                        // Check if admin saved a total, else calculate
                        if(match.totalAmount) {
                            fixedVanTotal = match.totalAmount;
                        } else {
                            fixedVanTotal = (parseFloat(match.amount) * 11).toString();
                        }
                    }
                }
            }

            // --- DISPLAY LOGIC ---

            // 1. Profile View (Show Fixed/Standard Amount)
            const profFixedAcEl = document.getElementById('prof-fixed-academic');
            if(profFixedAcEl) profFixedAcEl.innerText = (fixedAcademicFee !== 'Not Set') ? `₹ ${fixedAcademicFee}` : 'Not Set';

            // Profile View: Van Fee (Show Monthly)
            const profFixedVanEl = document.getElementById('prof-fixed-van');
            if(profFixedVanEl) profFixedVanEl.innerText = (fixedVanMonthly !== 'Not Set') ? `₹ ${fixedVanMonthly}` : 'Not Set';

            // 2. Dashboard View (Show Remaining Balance)
            // Logic: If balance exists in user doc, show it. Else fallback to Total Fee.
            
            let dashboardAcademic = data.academicFee;
            // If undefined/null, assume full amount due.
            if(dashboardAcademic === undefined || dashboardAcademic === null || dashboardAcademic === "") {
                dashboardAcademic = fixedAcademicFee;
            } 
            // If explicitly "Not Set" string, maybe user never assigned? Default to fixed.
            if(dashboardAcademic === 'Not Set') dashboardAcademic = fixedAcademicFee;


            let dashboardVan = data.vanFee;
            // If undefined/null, assume full amount due.
            if(dashboardVan === undefined || dashboardVan === null || dashboardVan === "") {
                dashboardVan = fixedVanTotal;
            }
            if(dashboardVan === 'Not Set') dashboardVan = fixedVanTotal;

            const dashAcEl = document.getElementById('dash-academic-fee');
            if(dashAcEl) dashAcEl.innerText = (dashboardAcademic !== 'Not Set') ? `₹ ${dashboardAcademic}` : 'Not Set';

            const dashVanEl = document.getElementById('dash-van-fee');
            if(dashVanEl) dashVanEl.innerText = (dashboardVan !== 'Not Set') ? `₹ ${dashboardVan}` : 'Not Set';
        }
    } catch(e) {
        console.error("Profile Load Error", e);
    }
}

// --- HISTORY POPUP LOGIC ---
window.openHistoryModal = async function() {
    if (!currentStudentCustomId) return;

    const modal = document.getElementById('historyModal');
    const tbody = document.getElementById('historyTableBody');
    const nameEl = document.getElementById('hist-student-name');
    const idEl = document.getElementById('hist-student-id');
    const dateInput = document.getElementById('historyDateSearch');

    nameEl.innerText = currentStudentName || "Student";
    idEl.innerText = currentStudentCustomId;
    dateInput.value = '';
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading history...</td></tr>';
    modal.style.display = 'flex';

    try {
        const paymentsRef = collection(db, "payments");
        const q = query(paymentsRef, where("studentId", "==", currentStudentCustomId));
        
        const snapshot = await getDocs(q);
        currentHistoryData = [];

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No payment history found.</td></tr>';
        } else {
            snapshot.forEach(doc => {
                currentHistoryData.push(doc.data());
            });

            // Sort Client-Side (Newest first)
            currentHistoryData.sort((a, b) => {
                const tA = a.timestamp ? a.timestamp.toDate() : new Date(0);
                const tB = b.timestamp ? b.timestamp.toDate() : new Date(0);
                return tB - tA;
            });

            renderHistoryTable(currentHistoryData);
        }
    } catch (e) {
        console.error("History Error:", e);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading history: ' + e.message + '</td></tr>';
    }
}

window.filterHistory = function() {
    const dateVal = document.getElementById('historyDateSearch').value;
    if(!dateVal) {
        renderHistoryTable(currentHistoryData);
        return;
    }

    const filtered = currentHistoryData.filter(item => {
        return item.date === dateVal;
    });
    renderHistoryTable(filtered);
}

function renderHistoryTable(data) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    if(data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found for this date.</td></tr>';
        return;
    }

    data.forEach(item => {
        const dateObj = item.timestamp ? item.timestamp.toDate() : new Date();
        const dateTimeStr = dateObj.toLocaleString();
        
        const acBal = item.academicBalance ? `₹ ${item.academicBalance}` : '-';
        const vnBal = item.vanBalance ? `₹ ${item.vanBalance}` : '-';

        const row = `
            <tr>
                <td class="hist-date">${dateTimeStr}</td>
                <td class="hist-amt">₹ ${item.academicAmount}</td>
                <td class="hist-bal-ac">${acBal}</td>
                <td class="hist-amt">₹ ${item.vanAmount}</td>
                <td class="hist-bal-vn">${vnBal}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
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
    window.showPopupConfirm("Logout", "Are you sure you want to logout?", () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
}