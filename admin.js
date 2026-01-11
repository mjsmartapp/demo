import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentRoleContext = ''; 
let currentStudentClass = ''; 
let currentStudentSection = ''; 
let selectedUserIds = []; 
let currentFetchedUsers = []; 
let idCounters = {}; // Cache to track ID sequences locally

// --- ON LOAD ---
window.addEventListener('load', async () => {
    injectCustomModals();

    const userName = localStorage.getItem('ssvms_user');
    const userRole = localStorage.getItem('ssvms_role');

    if (!userName || !userRole) {
        window.location.href = 'index.html';
        return;
    }

    const welcomeHeader = document.getElementById('welcome-msg');
    if(welcomeHeader) {
        welcomeHeader.innerHTML = `Welcome, <span style="text-transform: capitalize;">${userName}</span>`;
    }

    await fetchStats();
    populateClassGrid(); 

    // Initialize Search Listeners
    setupSearchListeners();

    const loader = document.getElementById('loader-wrapper');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
});

// --- SEARCH, FILTER & SORT LOGIC ---
function setupSearchListeners() {
    const searchInput = document.getElementById('tableSearchInput');
    const filterClass = document.getElementById('tableFilterClass');
    const filterSection = document.getElementById('tableFilterSection');

    if(searchInput) searchInput.addEventListener('input', filterUsers);
    if(filterClass) filterClass.addEventListener('change', filterUsers);
    if(filterSection) filterSection.addEventListener('change', filterUsers);
}

// Helper to assign numeric value to classes for sorting
function getClassRank(cls) {
    if (!cls) return 999; 
    const standardMap = { 'PRE-KG': -3, 'LKG': -2, 'UKG': -1 };
    if (standardMap[cls] !== undefined) return standardMap[cls];
    return parseInt(cls) || 999; 
}

window.filterUsers = function() {
    const searchTerm = document.getElementById('tableSearchInput').value.toLowerCase().trim();
    const filterClass = document.getElementById('tableFilterClass').value;
    const filterSection = document.getElementById('tableFilterSection').value;

    let filteredData = currentFetchedUsers.filter(user => {
        // 1. Search Logic
        const idMatch = user.customId && user.customId.toLowerCase().includes(searchTerm);
        const nameMatch = user.name && user.name.toLowerCase().includes(searchTerm);
        const phoneMatch = user.phone && user.phone.includes(searchTerm);
        
        const matchesSearch = !searchTerm || idMatch || nameMatch || phoneMatch;

        // 2. Class Logic
        const matchesClass = !filterClass || (user.studentClass === filterClass);

        // 3. Section Logic
        const matchesSection = !filterSection || (user.section === filterSection);

        return matchesSearch && matchesClass && matchesSection;
    });

    // --- SORTING LOGIC ---
    filteredData.sort((a, b) => {
        // Priority 1: Sort by Class Rank
        const rankA = getClassRank(a.studentClass);
        const rankB = getClassRank(b.studentClass);
        if (rankA !== rankB) return rankA - rankB;

        // Priority 2: Sort by Section
        const secA = a.section || '';
        const secB = b.section || '';
        if (secA < secB) return -1;
        if (secA > secB) return 1;

        // Priority 3: Sort by Name
        const nameA = a.name ? a.name.toLowerCase() : '';
        const nameB = b.name ? b.name.toLowerCase() : '';
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;

        return 0;
    });

    renderUserRows(filteredData);
};

window.resetFilters = function() {
    document.getElementById('tableSearchInput').value = '';
    document.getElementById('tableFilterClass').value = '';
    document.getElementById('tableFilterSection').value = '';
    
    window.filterUsers();
};


// --- CUSTOM MODAL LOGIC ---
function injectCustomModals() {
    if (document.getElementById('custom-alert-modal')) return;

    const modalHTML = `
    <div id="custom-alert-modal" class="modal-overlay" style="z-index: 3000; display: none;">
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
                <h3 id="custom-alert-title" style="font-size: 1.5rem; margin: 0;">Notification</h3>
            </div>
            <div class="modal-body" style="padding-top: 10px;">
                <p id="custom-alert-msg" style="margin-bottom: 25px; font-size: 1rem; color: #555; line-height: 1.5;"></p>
                <button id="custom-alert-ok-btn" class="save-btn" style="width: auto; padding: 10px 40px;">OK</button>
            </div>
        </div>
    </div>

    <div id="custom-confirm-modal" class="modal-overlay" style="z-index: 3000; display: none;">
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
                <h3 id="custom-confirm-title" style="font-size: 1.5rem; margin: 0;">Confirm Action</h3>
            </div>
            <div class="modal-body" style="padding-top: 10px;">
                <p id="custom-confirm-msg" style="margin-bottom: 25px; font-size: 1rem; color: #555; line-height: 1.5;"></p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="custom-confirm-cancel-btn" class="save-btn" style="background: #ef4444; width: auto; padding: 10px 30px;">Cancel</button>
                    <button id="custom-confirm-yes-btn" class="save-btn" style="width: auto; padding: 10px 30px;">Yes</button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('custom-alert-ok-btn').onclick = () => {
        document.getElementById('custom-alert-modal').style.display = 'none';
    };
    document.getElementById('custom-confirm-cancel-btn').onclick = () => {
        document.getElementById('custom-confirm-modal').style.display = 'none';
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
    document.getElementById('custom-confirm-modal').style.display = 'flex';

    const yesBtn = document.getElementById('custom-confirm-yes-btn');
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    newYesBtn.onclick = () => {
        document.getElementById('custom-confirm-modal').style.display = 'none';
        if (onConfirmCallback) onConfirmCallback();
    };
}


// --- DASHBOARD STATS ---
async function fetchStats() {
    const staffCountEl = document.getElementById('staffCount');
    const studentCountEl = document.getElementById('studentCount');

    if(!staffCountEl) return;

    try {
        const usersRef = collection(db, "users");

        const staffQuery = query(usersRef, where("role", "in", ["principal", "manager", "staff"]));
        const staffSnapshot = await getDocs(staffQuery);
        staffCountEl.innerText = staffSnapshot.size;

        const studentQuery = query(usersRef, where("role", "==", "student"));
        const studentSnapshot = await getDocs(studentQuery);
        studentCountEl.innerText = studentSnapshot.size;

    } catch (error) {
        console.error("Stats Error:", error);
    }
}

// --- POPULATE CLASS GRID ---
function populateClassGrid() {
    const container = document.getElementById('classGridContainer');
    if(!container) return;
    
    container.innerHTML = '';

    const allDiv = document.createElement('div');
    allDiv.className = 'class-card all-class-card'; 
    allDiv.innerHTML = `<i class="fas fa-layer-group"></i><h3>All</h3><p>Classes</p>`;
    allDiv.onclick = () => window.selectClass('All');
    container.appendChild(allDiv);

    const classes = ['PRE-KG', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    classes.forEach(cls => {
        const div = document.createElement('div');
        div.className = 'class-card';
        div.innerHTML = `<i class="fas fa-book-reader"></i><h3>${cls}</h3><p>Standard</p>`;
        div.onclick = () => window.selectClass(cls);
        container.appendChild(div);
    });
}

// --- ID GENERATOR ---
// Student: STSS + YY + CLASS + SEC + SEQUENCE (01..)
// Others:  ROLE + SS + YY + SEQUENCE (01..)
async function generateUserId(role, stClass = '', section = '') {
    const date = new Date();
    const shortYear = date.getFullYear().toString().slice(-2); // e.g., '25' for 2025

    let fullPrefix = "";

    if (role.toLowerCase() === 'student') {
        const cls = stClass ? stClass.toString().trim().toUpperCase() : 'NA';
        const sec = section ? section.toString().trim().toUpperCase() : 'NA';
        // Prefix example: STSS2510A
        fullPrefix = `STSS${shortYear}${cls}${sec}`; 
    } else {
        let rolePrefix = "US";
        switch(role.toLowerCase()) {
            case 'admin': rolePrefix = "AD"; break;
            case 'staff': rolePrefix = "SF"; break;
            case 'manager': rolePrefix = "MR"; break;
            case 'principal': rolePrefix = "PR"; break;
        }
        // Prefix example: ADSS25
        fullPrefix = `${rolePrefix}SS${shortYear}`;
    }

    // --- Caching Logic to prevent duplicates during loop/bulk import ---
    if (idCounters[fullPrefix] === undefined) {
        const usersRef = collection(db, "users");
        
        // Find existing max ID with this specific prefix
        const q = query(
            usersRef, 
            where("customId", ">=", fullPrefix), 
            where("customId", "<=", fullPrefix + "\uf8ff")
        );
        
        const querySnapshot = await getDocs(q);
        let maxSeq = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.customId && data.customId.startsWith(fullPrefix)) {
                // Extract the numeric part (everything after the prefix)
                const numPartStr = data.customId.substring(fullPrefix.length);
                const num = parseInt(numPartStr);
                if (!isNaN(num) && num > maxSeq) {
                    maxSeq = num;
                }
            }
        });
        idCounters[fullPrefix] = maxSeq;
    }

    // Increment locally
    idCounters[fullPrefix]++;
    
    // Format: Pad with at least 2 digits (e.g., 1 -> 01, 10 -> 10, 100 -> 100)
    const seqStr = idCounters[fullPrefix].toString().padStart(2, '0');
    
    return `${fullPrefix}${seqStr}`;
}

// --- DATE HELPER ---
function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    dateStr = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const match = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

// --- NAVIGATION ---
window.showUserList = function(roleType) {
    currentRoleContext = roleType;
    if (roleType === 'student') {
        window.switchMainView('class-selection-view');
    } else {
        loadUserTable(roleType);
    }
};

window.selectClass = function(className) {
    currentStudentClass = className;
    document.getElementById('section-view-title').innerText = `${className} Std - Select Section`;
    window.switchMainView('section-selection-view');
}

window.selectSection = function(section) {
    currentStudentSection = section;
    loadUserTable('student');
}

// --- LOAD TABLE DATA ---
async function loadUserTable(roleType) {
    window.switchMainView('users-list-view');
    
    selectedUserIds = [];
    currentFetchedUsers = [];
    updateBulkActionUI();
    document.getElementById('selectAllCheckbox').checked = false;
    
    window.resetFilters(); 

    const backBtn = document.getElementById('tableBackBtn');
    if (roleType === 'student') {
        backBtn.onclick = () => window.switchMainView('section-selection-view');
        let titleText = `Students: Class ${currentStudentClass}`;
        if(currentStudentClass === 'All') titleText = `All Students`;
        if(currentStudentSection !== 'All') titleText += ` - Sec ${currentStudentSection}`;
        document.getElementById('list-view-title').innerText = titleText;
    } else {
        backBtn.onclick = () => window.switchMainView('users-selection-view');
        const titleMap = { 'admin': 'Administrators', 'staff': 'Staff Members' };
        document.getElementById('list-view-title').innerText = titleMap[roleType] || 'User List';
    }

    document.getElementById('userTableBody').innerHTML = '';
    document.getElementById('table-loading').style.display = 'block';

    try {
        const usersRef = collection(db, "users");
        let q;

        if (roleType === 'staff') {
            q = query(usersRef, where("role", "in", ["principal", "manager", "staff"]));
        } else if (roleType === 'admin') {
            q = query(usersRef, where("role", "==", "admin"));
        } else if (roleType === 'student') {
            if (currentStudentClass === 'All') {
                if (currentStudentSection === 'All') {
                    q = query(usersRef, where("role", "==", "student"));
                } else {
                    q = query(usersRef, where("role", "==", "student"), where("section", "==", currentStudentSection));
                }
            } else {
                if (currentStudentSection === 'All') {
                    q = query(usersRef, where("role", "==", "student"), where("studentClass", "==", currentStudentClass));
                } else {
                    q = query(usersRef, where("role", "==", "student"), where("studentClass", "==", currentStudentClass), where("section", "==", currentStudentSection));
                }
            }
        }

        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((docSnap) => {
            currentFetchedUsers.push({ id: docSnap.id, ...docSnap.data() });
        });

        document.getElementById('table-loading').style.display = 'none';
        window.filterUsers();

    } catch (e) {
        console.error("Error fetching list:", e);
        document.getElementById('table-loading').innerText = "Error loading data.";
    }
}

// --- RENDER TABLE ROWS ---
function renderUserRows(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">No users found.</td></tr>';
        return;
    }

    users.forEach(data => {
        const id = data.id;
        const classDisplay = data.studentClass ? `${data.studentClass} - ${data.section}` : '-';
        const safeData = encodeURIComponent(JSON.stringify(data));
        const displayId = data.customId || "N/A"; 

        const row = `
            <tr>
                <td><input type="checkbox" class="user-select-chk" value="${id}" onchange="window.handleRowSelection(this)"></td>
                <td><strong style="color:var(--primary)">${displayId}</strong></td>
                <td><strong>${data.name}</strong></td>
                <td>${data.email}</td>
                <td>${data.phone}</td>
                <td>${classDisplay}</td> 
                <td><span class="role-badge role-${data.role}">${data.role.toUpperCase()}</span></td>
                <td>
                    <div class="action-icons">
                        <i class="fas fa-edit btn-edit" onclick="window.openEditModal('${safeData}')" title="Edit"></i>
                        <i class="fas fa-trash-alt btn-delete" onclick="window.deleteSingleUser('${id}')" title="Delete"></i>
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    document.getElementById('selectAllCheckbox').checked = false;
}


// --- CSV EXPORT ---
const exportCsvBtn = document.getElementById('exportCsvBtn');
if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
        if (currentFetchedUsers.length === 0) {
            window.showPopupAlert("Export Failed", "No data available to export.");
            return;
        }

        const headers = ["ID", "Name", "Email", "Phone", "DOB", "Role", "Class", "Section"];
        
        const rows = currentFetchedUsers.map(user => {
            const customId = user.customId || "";
            const name = user.name || "";
            const email = user.email || "";
            const phone = user.phone || "";
            const dob = user.dob || "";
            const role = user.role || "";
            const stClass = user.studentClass || "";
            const section = user.section || "";
            return `"${customId}","${name}","${email}","${phone}","${dob}","${role}","${stClass}","${section}"`;
        });

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `users_export_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

// --- CSV IMPORT ---
const importCsvBtn = document.getElementById('importCsvBtn');
const csvFileInput = document.getElementById('csvFileInput');

if (importCsvBtn && csvFileInput) {
    importCsvBtn.addEventListener('click', () => {
        csvFileInput.click();
    });

    csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const text = event.target.result;
            processCSVData(text);
        };
        reader.readAsText(file);
        csvFileInput.value = '';
    });
}

function processCSVData(csvText) {
    const lines = csvText.split('\n');
    if (lines.length < 2) {
        window.showPopupAlert("Import Error", "CSV file appears to be empty or missing data.");
        return;
    }

    // Replace native confirm with custom Confirm Modal
    window.showPopupConfirm("Import CSV", `Found ${lines.length - 1} rows (excluding header).\nDo you want to proceed with the import?`, async () => {
        
        // --- START IMPORT LOGIC (Inside Callback) ---
        let successCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;

        importCsvBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
        importCsvBtn.disabled = true;

        const usersRef = collection(db, "users");

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cols = line.split(',');
            const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim());

            let name, email, phone, dob, role, stClass, section;
            
            if(cleanCols.length >= 8) {
                [, name, email, phone, dob, role, stClass, section] = cleanCols;
            } else {
                [name, email, phone, dob, role, stClass, section] = cleanCols;
            }

            if (!name || !email || !role) {
                console.warn(`Row ${i} skipped: Missing mandatory fields.`);
                errorCount++;
                continue;
            }
            
            const formattedDob = formatDateForInput(dob || '');
            let isDuplicate = false;

            try {
                if (role.toLowerCase() === 'student') {
                    // For Students: Check EXACT duplicate (Name, Class, Sec, DOB)
                    const qStudent = query(usersRef, where("role", "==", "student"), where("name", "==", name));
                    const snapStudent = await getDocs(qStudent);
                    snapStudent.forEach(doc => {
                        const d = doc.data();
                        if (d.dob === formattedDob && d.studentClass === stClass && d.section === section) {
                            isDuplicate = true;
                        }
                    });
                } else {
                    // For Others: Check Email/Phone Strict
                    const qEmail = query(usersRef, where("email", "==", email));
                    const snapEmail = await getDocs(qEmail);
                    if (!snapEmail.empty) isDuplicate = true;

                    if (!isDuplicate && phone) {
                        const qPhone = query(usersRef, where("phone", "==", phone));
                        const snapPhone = await getDocs(qPhone);
                        if (!snapPhone.empty) isDuplicate = true;
                    }
                }
            } catch (e) {
                console.error("Error checking duplicates: ", e);
            }

            if (isDuplicate) {
                duplicateCount++;
                continue; 
            }

            try {
                // Pass class and section to generator
                const newId = await generateUserId(role.toLowerCase(), stClass, section);

                const userData = {
                    customId: newId,
                    name, 
                    email, 
                    phone: phone || '', 
                    dob: formattedDob, 
                    role: role.toLowerCase(),
                    createdAt: new Date()
                };

                if (stClass) userData.studentClass = stClass;
                if (section) userData.section = section;

                await addDoc(usersRef, userData);
                successCount++;

            } catch (e) {
                console.error(`Error processing row ${i}:`, e);
                errorCount++;
            }
        }

        importCsvBtn.innerHTML = '<i class="fas fa-file-upload"></i> Import CSV';
        importCsvBtn.disabled = false;

        window.showPopupAlert("Import Results", `✅ Added: ${successCount}\n⚠️ Skipped (Duplicates): ${duplicateCount}\n❌ Errors: ${errorCount}`);
        
        loadUserTable(currentRoleContext);
        fetchStats();
    });
}

// --- SELECTION LOGIC ---
window.toggleSelectAll = function() {
    const masterChk = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.user-select-chk');
    selectedUserIds = [];

    checkboxes.forEach(chk => {
        chk.checked = masterChk.checked;
        if(masterChk.checked) selectedUserIds.push(chk.value);
    });
    
    updateBulkActionUI();
};

window.handleRowSelection = function(chk) {
    if (chk.checked) {
        selectedUserIds.push(chk.value);
    } else {
        selectedUserIds = selectedUserIds.filter(id => id !== chk.value);
    }
    document.getElementById('selectAllCheckbox').checked = 
        document.querySelectorAll('.user-select-chk').length === selectedUserIds.length;
    updateBulkActionUI();
};

function updateBulkActionUI() {
    const bulkBar = document.getElementById('bulk-actions');
    const countSpan = document.getElementById('selected-count');
    countSpan.innerText = selectedUserIds.length;
    bulkBar.style.display = selectedUserIds.length > 0 ? 'flex' : 'none';
}

// --- DELETE LOGIC ---
window.deleteSingleUser = function(id) {
    window.showPopupConfirm("Delete User", "Are you sure you want to delete this user permanently?", async () => {
        try {
            await deleteDoc(doc(db, "users", id));
            loadUserTable(currentRoleContext); 
            fetchStats();
        } catch (e) {
            window.showPopupAlert("Error", "Error deleting user: " + e.message);
        }
    });
};

window.deleteSelectedUsers = function() {
    if(selectedUserIds.length === 0) return;
    
    window.showPopupConfirm("Bulk Delete", `Are you sure you want to delete ${selectedUserIds.length} users?`, async () => {
        const btn = document.querySelector('.bulk-delete-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Deleting...';
        btn.disabled = true;

        try {
            const deletePromises = selectedUserIds.map(id => deleteDoc(doc(db, "users", id)));
            await Promise.all(deletePromises);
            window.showPopupAlert("Success", "Selected users deleted successfully.");
            loadUserTable(currentRoleContext);
            fetchStats();
        } catch (e) {
            console.error(e);
            window.showPopupAlert("Error", "Error during bulk delete: " + e.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
};

// --- EDIT LOGIC ---
window.openEditModal = function(encodedData) {
    const user = JSON.parse(decodeURIComponent(encodedData));
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserCustomId').value = user.customId || 'N/A'; 
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editUserEmail').value = user.email || ''; 
    document.getElementById('editUserPhone').value = user.phone;
    document.getElementById('editUserDob').value = user.dob || '';
    document.getElementById('editUserRole').value = user.role; 
    
    const studentFields = document.getElementById('edit-student-fields');
    if (user.role === 'student') {
        studentFields.style.display = 'block';
        document.getElementById('editStudentClass').value = user.studentClass || '';
        document.getElementById('editStudentSection').value = user.section || '';
    } else {
        studentFields.style.display = 'none';
    }
    document.getElementById('editModal').style.display = 'flex';
};

window.closeEditModal = function() {
    document.getElementById('editModal').style.display = 'none';
};

const updateUserBtn = document.getElementById('updateUserBtn');
if(updateUserBtn) {
    updateUserBtn.addEventListener('click', async () => {
        const id = document.getElementById('editUserId').value;
        const name = document.getElementById('editUserName').value;
        const email = document.getElementById('editUserEmail').value;
        const phone = document.getElementById('editUserPhone').value;
        const dob = document.getElementById('editUserDob').value;
        const role = document.getElementById('editUserRole').value;
        
        let studentClass = null;
        let section = null;
        if (role === 'student') {
            studentClass = document.getElementById('editStudentClass').value;
            section = document.getElementById('editStudentSection').value;
        }

        if(!name || !email || !phone || !dob || !role) {
            window.showPopupAlert("Validation Error", "Please fill all required fields");
            return;
        }

        updateUserBtn.innerHTML = "Updating...";
        updateUserBtn.disabled = true;

        try {
            const userRef = doc(db, "users", id);
            const updateData = { name, email, phone, dob, role };
            if(role === 'student') {
                updateData.studentClass = studentClass;
                updateData.section = section;
            }
            await updateDoc(userRef, updateData);
            window.showPopupAlert("Success", "User updated successfully!");
            window.closeEditModal();
            loadUserTable(currentRoleContext); 
        } catch(e) {
            window.showPopupAlert("Error", "Error updating user: " + e.message);
        } finally {
            updateUserBtn.innerHTML = "Update Details";
            updateUserBtn.disabled = false;
        }
    });
}

// --- ADD NEW USER LOGIC ---
const addNewUserBtn = document.getElementById('addNewUserBtn');
if(addNewUserBtn) {
    addNewUserBtn.addEventListener('click', () => {
        openAddUserForm(currentRoleContext);
    });
}

window.openAddUserForm = function(type) {
    window.switchMainView('add-user-view');
    const roleSelect = document.getElementById('newUserRole');
    const title = document.getElementById('form-title');
    const studentFields = document.getElementById('student-additional-fields');
    const roleGroup = document.getElementById('role-group');
    
    const formBackBtn = document.getElementById('formBackBtn');
    formBackBtn.onclick = () => window.switchMainView('users-list-view');

    // Reset Fields
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPhone').value = '';
    document.getElementById('newUserDob').value = '';
    document.getElementById('newStudentClass').value = '';
    document.getElementById('newStudentSection').value = '';

    if (type === 'admin') {
        title.innerText = "Add New Admin";
        roleSelect.value = 'admin';
        roleGroup.style.display = 'none';
        studentFields.style.display = 'none';
    } else if (type === 'student') {
        title.innerText = "Add New Student";
        roleSelect.value = 'student';
        roleGroup.style.display = 'none';
        studentFields.style.display = 'block'; 
        if(currentStudentClass && currentStudentClass !== 'All') {
            document.getElementById('newStudentClass').value = currentStudentClass;
        }
        if(currentStudentSection && currentStudentSection !== 'All') {
            document.getElementById('newStudentSection').value = currentStudentSection;
        }
    } else if (type === 'staff') {
        title.innerText = "Add New Staff";
        roleSelect.value = 'staff'; 
        roleGroup.style.display = 'block';
        studentFields.style.display = 'none';
    }
}

const saveUserBtn = document.getElementById('saveUserBtn');
if (saveUserBtn) {
    saveUserBtn.addEventListener('click', async () => {
        const name = document.getElementById('newUserName').value;
        const email = document.getElementById('newUserEmail').value;
        const phone = document.getElementById('newUserPhone').value;
        const dob = document.getElementById('newUserDob').value;
        const role = document.getElementById('newUserRole').value;
        
        const studentClass = document.getElementById('newStudentClass').value;
        const section = document.getElementById('newStudentSection').value;

        if (!name || !email || !phone || !dob) { 
            window.showPopupAlert("Validation Error", "Please fill all fields."); 
            return; 
        }
        if(role === 'student' && (!studentClass || !section)) { 
            window.showPopupAlert("Validation Error", "Please select Class and Section."); 
            return; 
        }

        saveUserBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveUserBtn.disabled = true;

        try {
            const usersRef = collection(db, "users");
            
            // --- UPDATED DUPLICATE LOGIC ---
            if (role === 'student') {
                // Students: Allow duplicate Email/Phone, check EXACT match
                const qStudent = query(usersRef, where("role", "==", "student"), where("name", "==", name));
                const snapStudent = await getDocs(qStudent);
                
                let isExactDuplicate = false;
                snapStudent.forEach(doc => {
                    const d = doc.data();
                    if (d.studentClass === studentClass && d.section === section && d.dob === dob) {
                        isExactDuplicate = true;
                    }
                });

                if (isExactDuplicate) {
                    window.showPopupAlert("Duplicate Found", "Student with this Name, Class, Section & DOB already exists.");
                    resetButton();
                    return;
                }
            } else {
                // Admins/Staff: STRICT Email Unique Check
                const q = query(usersRef, where("email", "==", email));
                const snap = await getDocs(q);

                if (!snap.empty) { 
                    window.showPopupAlert("Duplicate Found", "User with this email already exists!"); 
                    resetButton(); 
                    return; 
                }
            }
            // --- END UPDATED LOGIC ---

            // Pass class and section to generator
            const newId = await generateUserId(role, studentClass, section);

            const userData = { 
                customId: newId, 
                name, email, phone, dob, role, createdAt: new Date() 
            };
            
            if (role === 'student') {
                userData.studentClass = studentClass;
                userData.section = section;
            }

            await addDoc(collection(db, "users"), userData);
            window.showPopupAlert("Success", `User Added Successfully!\nID: ${newId}`);
            await fetchStats();
            loadUserTable(currentRoleContext); 
        } catch (e) {
            console.error("Error adding user: ", e);
            window.showPopupAlert("Error", "Error: " + e.message);
        } finally {
            resetButton();
        }
    });
}

function resetButton() {
    saveUserBtn.innerHTML = 'Create Account';
    saveUserBtn.disabled = false;
}

// --- LOGOUT ---
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        window.showPopupConfirm("Logout", "Are you sure you want to logout?", () => {
            localStorage.removeItem('ssvms_user');
            localStorage.removeItem('ssvms_role');
            window.location.href = 'index.html';
        });
    });
}