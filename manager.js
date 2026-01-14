import { db } from './firebase.js';
import { collection, getDocs, query, where, doc, updateDoc, addDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Global State
let currentAccountClass = '';
let currentAccountSection = '';
let allClassFees = [];
let allVanFees = [];
let allStudentsCache = []; // Cache to store basic student info for search
let selectedStudentForPayment = null; // Store full object of selected student
let currentHistoryData = []; // Store fetched history for filtering

// --- ON LOAD ---
window.addEventListener('load', async () => {
    // Setup Popup Listeners
    setupCustomModals();

    const userName = localStorage.getItem('ssvms_user');
    const userRole = localStorage.getItem('ssvms_role');

    if (!userName || (userRole !== 'manager' && userRole !== 'admin')) {
        window.location.href = 'index.html';
        return;
    }

    if(userName) {
        document.getElementById('welcome-msg').innerHTML = `Welcome, <span style="text-transform: capitalize;">${userName}</span>`;
    }

    // Initialize Views
    await Promise.all([fetchTodayStats(), fetchFeeCache()]); 
    populateClassGrid();

    // Hide Loader
    setTimeout(() => {
        const loader = document.getElementById('loader-wrapper');
        if(loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 800);
});

// --- FETCH FEES CACHE ---
async function fetchFeeCache() {
    try {
        const classQ = query(collection(db, "class_fees"));
        const vanQ = query(collection(db, "van_fees"));
        const [classSnap, vanSnap] = await Promise.all([getDocs(classQ), getDocs(vanQ)]);
        
        allClassFees = [];
        classSnap.forEach(d => allClassFees.push({id: d.id, ...d.data()}));
        
        allVanFees = [];
        vanSnap.forEach(d => allVanFees.push({id: d.id, ...d.data()}));
    } catch(e) {
        console.error("Error caching fees:", e);
    }
}

// --- PAYMENTS LOGIC ---

window.openAddPaymentModal = async function() {
    document.getElementById('addPaymentModal').style.display = 'flex';
    // Clear fields
    document.getElementById('payStudentSearch').value = '';
    document.getElementById('payStudentClass').value = '';
    document.getElementById('payStudentSection').value = '';
    document.getElementById('payStudentPhone').value = '';
    document.getElementById('payAcademicBal').value = '';
    document.getElementById('payVanBal').value = '';
    document.getElementById('payAcademicInput').value = '';
    document.getElementById('payVanInput').value = '';
    
    // Clear new field
    if(document.getElementById('payVanMonthly')) {
        document.getElementById('payVanMonthly').value = '';
    }
    
    selectedStudentForPayment = null;
    
    // Fetch and populate datalist with filtered students
    await fetchAllStudentsForSearch();
    populateStudentDatalist();
}

async function fetchAllStudentsForSearch() {
    const btn = document.querySelector('.add-new-btn');
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("role", "==", "student"));
        const snap = await getDocs(q);
        
        allStudentsCache = [];
        snap.forEach(doc => {
            allStudentsCache.push({ id: doc.id, ...doc.data() });
        });
    } catch(e) {
        console.error("Error fetching students:", e);
    } finally {
        if(btn) btn.innerHTML = '<i class="fas fa-plus-circle"></i> New Payment';
    }
}

function populateStudentDatalist() {
    const list = document.getElementById('payStudentList');
    list.innerHTML = '';
    
    // Filter students based on current selected Class and Section
    const filteredStudents = allStudentsCache.filter(s => {
        const matchClass = s.studentClass === currentAccountClass;
        const matchSection = currentAccountSection === 'All' ? true : s.section === currentAccountSection;
        return matchClass && matchSection;
    });

    if (filteredStudents.length === 0) {
        const opt = document.createElement('option');
        opt.value = "No students found in this section";
        list.appendChild(opt);
    }

    filteredStudents.forEach(s => {
        const opt = document.createElement('option');
        opt.value = `${s.customId} - ${s.name}`; 
        list.appendChild(opt);
    });
}

window.handlePaymentStudentChange = function() {
    const val = document.getElementById('payStudentSearch').value;
    if(!val) return;
    
    // Extract ID from "ID - Name" string
    const customId = val.split(" - ")[0];
    
    // Find in cache
    selectedStudentForPayment = allStudentsCache.find(s => s.customId === customId);
    
    if(selectedStudentForPayment) {
        const s = selectedStudentForPayment;
        document.getElementById('payStudentClass').value = s.studentClass || '';
        document.getElementById('payStudentSection').value = s.section || '';
        document.getElementById('payStudentPhone').value = s.phone || '';
        
        // Calculate/Get Balances using the smart logic
        let acFee = getAcademicFeeBalance(s);
        let vnFee = getVanFeeBalance(s);
        
        document.getElementById('payAcademicBal').value = acFee === 'Not Set' ? 0 : acFee;
        document.getElementById('payVanBal').value = vnFee === 'Not Set' ? 0 : vnFee;

        // Populate Monthly Rate Logic
        let vnMonthly = '0';
        if (s.pincode && s.place) {
             const vanMatch = allVanFees.filter(f => f.pincode === s.pincode && f.place.toLowerCase() === s.place.toLowerCase());
             if (vanMatch.length > 0) {
                 vanMatch.sort((a,b) => (a.year > b.year ? -1 : 1));
                 vnMonthly = vanMatch[0].amount;
             }
        }
        if(document.getElementById('payVanMonthly')) {
            document.getElementById('payVanMonthly').value = vnMonthly;
        }
    }
}

window.processPayment = function() {
    if(!selectedStudentForPayment) {
        window.showPopupAlert("Error", "Please select a valid student from the list.");
        return;
    }

    const payAc = parseFloat(document.getElementById('payAcademicInput').value) || 0;
    const payVn = parseFloat(document.getElementById('payVanInput').value) || 0;
    
    if(payAc <= 0 && payVn <= 0) {
        window.showPopupAlert("Error", "Please enter a valid amount to pay.");
        return;
    }

    const currentAcBal = parseFloat(document.getElementById('payAcademicBal').value) || 0;
    const currentVnBal = parseFloat(document.getElementById('payVanBal').value) || 0;

    // Optional: Prevent overpayment
    if(payAc > currentAcBal) { window.showPopupAlert("Error", "Academic payment exceeds balance."); return; }
    if(payVn > currentVnBal) { window.showPopupAlert("Error", "Van payment exceeds balance."); return; }

    window.showPopupConfirm("Confirm Payment", 
        `Total Pay: ₹ ${payAc + payVn}\n(Academic: ${payAc}, Van: ${payVn})\nProceed?`, 
        async () => {
            const btn = document.getElementById('submitPaymentBtn');
            btn.innerHTML = "Processing...";
            btn.disabled = true;

            try {
                // 1. Update Student Profile (Deduct Balances)
                const newAcBal = currentAcBal - payAc;
                const newVnBal = currentVnBal - payVn;
                
                const userRef = doc(db, "users", selectedStudentForPayment.id);
                
                await updateDoc(userRef, {
                    academicFee: newAcBal.toString(),
                    vanFee: newVnBal.toString()
                });

                // Update Local Cache Object
                selectedStudentForPayment.academicFee = newAcBal.toString();
                selectedStudentForPayment.vanFee = newVnBal.toString();

                // 2. Log Payment Transaction
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                const todayString = `${year}-${month}-${day}`; // YYYY-MM-DD

                await addDoc(collection(db, "payments"), {
                    studentId: selectedStudentForPayment.customId,
                    studentName: selectedStudentForPayment.name,
                    amount: (payAc + payVn).toString(),
                    academicAmount: payAc.toString(),
                    vanAmount: payVn.toString(),
                    academicBalance: newAcBal.toString(),
                    vanBalance: newVnBal.toString(),
                    date: todayString,
                    timestamp: new Date()
                });

                // 3. Success
                window.showPopupAlert("Success", "Payment processed successfully!");
                document.getElementById('addPaymentModal').style.display = 'none';
                
                // Refresh
                await fetchTodayStats();
                if(document.getElementById('accounts-list-view').style.display === 'block') {
                    loadAccountStudents();
                }

            } catch(e) {
                console.error("Payment Error:", e);
                window.showPopupAlert("Error", "Transaction failed: " + e.message);
            } finally {
                btn.innerHTML = "Submit Payment";
                btn.disabled = false;
            }
        }
    );
}

// Logic to get fee balance
function getAcademicFeeBalance(data) {
    let acFee = data.academicFee;
    if (!acFee || acFee === 'Not Set') {
        const classMatch = allClassFees.filter(f => f.class === data.studentClass);
        if (classMatch.length > 0) {
            const secMatch = classMatch.find(f => f.section === data.section);
            if (secMatch) acFee = secMatch.amount;
            else {
                classMatch.sort((a,b) => (a.year > b.year ? -1 : 1));
                acFee = classMatch[0].amount;
            }
        } else { acFee = 'Not Set'; }
    }
    return acFee;
}

function getVanFeeBalance(data) {
    let vnFee = data.vanFee;
    if (!vnFee || vnFee === 'Not Set') {
        if (data.pincode && data.place) {
            const vanMatch = allVanFees.filter(f => f.pincode === data.pincode && f.place.toLowerCase() === data.place.toLowerCase());
            if (vanMatch.length > 0) {
                vanMatch.sort((a,b) => (a.year > b.year ? -1 : 1));
                if (vanMatch[0].totalAmount) {
                     vnFee = vanMatch[0].totalAmount;
                } else {
                     const monthly = parseFloat(vanMatch[0].amount) || 0;
                     vnFee = (monthly * 11).toString();
                }
            } else { vnFee = 'Not Set'; }
        } else { vnFee = 'Not Set'; }
    }
    return vnFee;
}

// --- HISTORY MODAL LOGIC ---
window.openHistoryModal = async function(studentCustomId) {
    const modal = document.getElementById('historyModal');
    const tbody = document.getElementById('historyTableBody');
    const nameEl = document.getElementById('hist-student-name');
    const idEl = document.getElementById('hist-student-id');
    const dateInput = document.getElementById('historyDateSearch');

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading history...</td></tr>';
    
    // Find student info from cache if possible
    let studentName = "Student";
    if(allStudentsCache.length === 0) {
        await fetchAllStudentsForSearch(); // Ensure we have student data
    }
    const student = allStudentsCache.find(s => s.customId === studentCustomId);
    if(student) studentName = student.name;

    nameEl.innerText = studentName;
    idEl.innerText = studentCustomId;
    dateInput.value = ''; // Reset date search

    modal.style.display = 'flex';

    try {
        const paymentsRef = collection(db, "payments");
        const q = query(paymentsRef, where("studentId", "==", studentCustomId));
        
        const snapshot = await getDocs(q);
        currentHistoryData = [];

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No payment history found.</td></tr>';
        } else {
            snapshot.forEach(doc => {
                currentHistoryData.push(doc.data());
            });

            // Client-side sorting (Newest first)
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
        // item.date is typically YYYY-MM-DD string stored in DB
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

        // Colored rows for clarity
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

// --- CUSTOM MODAL LOGIC ---
function setupCustomModals() {
    const alertModal = document.getElementById('custom-alert-modal');
    const confirmModal = document.getElementById('custom-confirm-modal');

    const alertOk = document.getElementById('custom-alert-ok-btn');
    if(alertOk) {
        alertOk.onclick = () => { alertModal.style.display = 'none'; };
    }

    const confirmCancel = document.getElementById('custom-confirm-cancel-btn');
    if(confirmCancel) {
        confirmCancel.onclick = () => { confirmModal.style.display = 'none'; };
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

    const yesBtn = document.getElementById('custom-confirm-yes-btn');
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    newYesBtn.onclick = () => {
        modal.style.display = 'none';
        if (onConfirmCallback) onConfirmCallback();
    };
}

// --- NAVIGATION LOGIC ---
window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));

    if(viewId === 'dashboard-view') {
        document.getElementById('nav-dashboard').classList.add('active');
        const mobNav = document.getElementById('mob-nav-dashboard');
        if(mobNav) mobNav.classList.add('active');
        document.getElementById('page-title').innerText = "Manager Overview";
    } else if (viewId.includes('accounts')) {
        document.getElementById('nav-accounts').classList.add('active');
        const mobNav = document.getElementById('mob-nav-accounts');
        if(mobNav) mobNav.classList.add('active');
        document.getElementById('page-title').innerText = "Accounts Management";
    }
    
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
        localStorage.removeItem('ssvms_user');
        localStorage.removeItem('ssvms_role');
        window.location.href = 'index.html';
    });
}

// --- DASHBOARD STATS LOGIC ---
async function fetchTodayStats() {
    const countEl = document.getElementById('today-tx-count');
    const amountEl = document.getElementById('today-tx-amount');

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;

    try {
        const paymentsRef = collection(db, "payments");
        const q = query(paymentsRef, where("date", "==", todayString));
        const snapshot = await getDocs(q);

        let totalCount = 0;
        let totalAmount = 0;

        snapshot.forEach(doc => {
            totalCount++;
            const data = doc.data();
            const amt = parseFloat(data.amount) || 0;
            totalAmount += amt;
        });

        countEl.innerText = totalCount;
        amountEl.innerText = `₹ ${totalAmount.toLocaleString()}`;

    } catch (e) {
        console.error("Error fetching stats:", e);
        countEl.innerText = "0";
        amountEl.innerText = "₹ 0";
    }
}

// --- ACCOUNTS: CLASS GRID LOGIC ---
function populateClassGrid() {
    const container = document.getElementById('classGridContainer');
    if(!container) return;
    
    container.innerHTML = '';

    const classes = ['PRE-KG', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    classes.forEach(cls => {
        const div = document.createElement('div');
        div.className = 'class-card';
        div.innerHTML = `<i class="fas fa-book-reader"></i><h3>${cls}</h3><p>Standard</p>`;
        div.onclick = () => window.selectClassForAccounts(cls);
        container.appendChild(div);
    });
}

// --- ACCOUNTS: SECTION SELECTION LOGIC ---
window.selectClassForAccounts = function(className) {
    currentAccountClass = className;
    document.getElementById('section-view-title').innerText = `${className} Std - Select Section`;
    
    const container = document.getElementById('sectionGridContainer');
    container.innerHTML = '';

    const allDiv = document.createElement('div');
    allDiv.className = 'section-card';
    allDiv.onclick = () => window.selectSectionForAccounts('All');
    allDiv.innerHTML = `<div class="section-avatar" style="background:#f3e5f5; color:#7b1fa2;"><i class="fas fa-users"></i></div><h3>All Sections</h3>`;
    container.appendChild(allDiv);

    const sections = getSectionsForClass(className);
    sections.forEach(sec => {
        const div = document.createElement('div');
        div.className = 'section-card';
        div.onclick = () => window.selectSectionForAccounts(sec);
        
        let displayAvatar = sec;
        if(sec.startsWith('GROUP')) displayAvatar = sec.replace('GROUP', 'G');
        let displayTitle = sec.startsWith('GROUP') ? sec : `Section ${sec}`;

        div.innerHTML = `<div class="section-avatar">${displayAvatar}</div><h3>${displayTitle}</h3>`;
        container.appendChild(div);
    });

    window.switchView('accounts-section-view');
}

function getSectionsForClass(cls) {
    if (cls === '11' || cls === '12') {
        return ['GROUP1', 'GROUP2', 'GROUP3', 'GROUP4', 'GROUP5'];
    }
    return ['A', 'B', 'C', 'D'];
}

// --- ACCOUNTS: STUDENT LIST LOGIC ---
window.selectSectionForAccounts = function(sectionName) {
    currentAccountSection = sectionName;
    
    let title = `${currentAccountClass} Std`;
    if(sectionName !== 'All') title += ` - Section ${sectionName}`;
    else title += ` - All Sections`;
    
    document.getElementById('list-view-title').innerText = title;
    
    loadAccountStudents();
    window.switchView('accounts-list-view');
}

async function loadAccountStudents() {
    const tbody = document.getElementById('accountTableBody');
    const loading = document.getElementById('table-loading');
    
    tbody.innerHTML = '';
    loading.style.display = 'block';

    try {
        const usersRef = collection(db, "users");
        let q;

        if (currentAccountSection === 'All') {
            q = query(usersRef, where("role", "==", "student"), where("studentClass", "==", currentAccountClass));
        } else {
            q = query(usersRef, where("role", "==", "student"), where("studentClass", "==", currentAccountClass), where("section", "==", currentAccountSection));
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No students found.</td></tr>';
        } else {
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // Get Balance (with fallback logic)
                const acFee = getAcademicFeeBalance(data);
                const vnFee = getVanFeeBalance(data);
                
                // Determine Status based on current balance
                let status = '<span style="color:green">Cleared</span>';
                if(acFee !== 'Not Set' && parseFloat(acFee) > 0) status = '<span style="color:orange">Due</span>';
                if(vnFee !== 'Not Set' && parseFloat(vnFee) > 0) status = '<span style="color:orange">Due</span>';

                const row = `
                    <tr>
                        <td><strong>${data.customId || 'N/A'}</strong></td>
                        <td>${data.name}</td>
                        <td>${data.phone}</td>
                        <td>₹ ${acFee}</td>
                        <td>₹ ${vnFee}</td>
                        <td>${status}</td>
                        <td><button class="btn-history" onclick="window.openHistoryModal('${data.customId}')"><i class="fas fa-history"></i> History</button></td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="7" style="color:red; text-align:center;">Error loading data.</td></tr>';
    } finally {
        loading.style.display = 'none';
    }
}