import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentRoleContext = ''; 
let currentStudentClass = ''; 
let currentStudentSection = ''; 
let selectedUserIds = []; 
let currentFetchedUsers = []; 
let idCounters = {}; 

// Cache for fee structures
let allClassFees = [];
let allVanFees = [];

// Local Data for Tables (for Sorting/Filtering)
let currentClassFeesData = [];
let currentVanFeesData = [];

// --- ON LOAD ---
window.addEventListener('load', async () => {
    injectCustomModals();
    injectEditStudentFields(); // Ensure edit fields exist

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
    await fetchFeeCache(); // Load fees into memory
    populateClassGrid(); 

    // Initialize Search Listeners
    setupSearchListeners();
    // Initialize Fee Button Listeners
    setupFeeListeners();

    // --- DYNAMIC UI UPDATES FOR VAN FEES ---
    const vanYearInput = document.getElementById('vanFeeYear');
    if (vanYearInput && vanYearInput.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'vanFeeYear';
        vanYearInput.replaceWith(select);
    }

    const vanAddBtn = document.querySelector('#van-fees-view .add-new-btn');
    if(vanAddBtn) {
        vanAddBtn.onclick = function(e) {
            e.preventDefault();
            window.openAddVanFeeModal();
        };
    }

    // --- Hook into navigation to load fees data ---
    const originalSwitch = window.switchMainView;
    window.switchMainView = function(viewId) {
        if(originalSwitch) originalSwitch(viewId);
        
        if (viewId === 'class-fees-view') {
            loadClassFees();
        } else if (viewId === 'van-fees-view') {
            loadVanFees();
        }
    };

    const loader = document.getElementById('loader-wrapper');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
});

// --- DYNAMIC HTML INJECTION FOR EDIT USER MODAL ---
function injectEditStudentFields() {
    const container = document.getElementById('edit-student-fields');
    if (container && !document.getElementById('editStudentPincode')) {
        const html = `
            <div class="input-group">
                <label>Pincode</label>
                <input type="text" id="editStudentPincode" list="pincodeList" placeholder="Enter Pincode" onchange="window.handleEditStudentPincodeChange()">
            </div>
            <div class="input-group">
                <label>Place</label>
                <select id="editStudentPlace">
                    <option value="">Select Place</option>
                </select>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    }
}

// --- DYNAMIC HTML INJECTION FOR ADD VAN FEE MODAL ---
function injectAddVanFeeFields() {
    const amountInput = document.getElementById('vanFeeAmount');
    if (amountInput && !document.getElementById('vanFeeMonths')) {
        const container = amountInput.closest('.input-group');
        
        const label = container.querySelector('label');
        if(label) label.innerText = "Fees Amount (Per Month)";
        
        amountInput.setAttribute('oninput', 'window.calculateVanFeeTotal()');

        const extraFieldsHTML = `
            <div class="input-group">
                <label>No. of Months</label>
                <input type="number" id="vanFeeMonths" value="11" placeholder="Enter Months" oninput="window.calculateVanFeeTotal()">
            </div>
            <div class="input-group">
                <label>Total Fees Amount</label>
                <input type="text" id="vanFeeTotal" readonly style="background-color: #f0f0f0; font-weight: bold;">
            </div>
        `;
        container.insertAdjacentHTML('afterend', extraFieldsHTML);
    }
}

// --- DYNAMIC HTML INJECTION FOR EDIT VAN FEE MODAL ---
function injectEditVanFeeFields() {
    const amountInput = document.getElementById('editVanFeeAmount');
    // Only inject if container exists and fields haven't been added yet
    if (amountInput && !document.getElementById('editVanFeeMonths')) {
        const container = amountInput.closest('.input-group');
        
        // Change label
        const label = container.querySelector('label');
        if(label) label.innerText = "Fees Amount (Per Month)";
        
        // Add listener
        amountInput.setAttribute('oninput', 'window.calculateEditVanFeeTotal()');

        // Inject new fields
        const extraFieldsHTML = `
            <div class="input-group">
                <label>No. of Months</label>
                <input type="number" id="editVanFeeMonths" placeholder="Enter Months" oninput="window.calculateEditVanFeeTotal()">
            </div>
            <div class="input-group">
                <label>Total Fees Amount</label>
                <input type="text" id="editVanFeeTotal" readonly style="background-color: #f0f0f0; font-weight: bold;">
            </div>
        `;
        container.insertAdjacentHTML('afterend', extraFieldsHTML);
    }
}

// --- DYNAMIC INJECTION FOR FEE FILTERS ---
function injectFeeFilters(viewId, type) {
    const view = document.getElementById(viewId);
    if (!view) return;
    
    // Check if filter container already exists to avoid duplication
    if (view.querySelector('.filter-container')) return;

    const headerBox = view.querySelector('.list-header-box');
    if (!headerBox) return;

    const filterHtml = `
        <div class="filter-container">
            <div class="search-box">
                <i class="fas fa-search"></i>
                <input type="text" id="search${type}" placeholder="Search..." oninput="window.filter${type}s()">
            </div>
            <button class="reset-filter-btn" onclick="window.reset${type}Filter()">
                <i class="fas fa-sync-alt"></i> Reset
            </button>
        </div>
    `;
    
    headerBox.insertAdjacentHTML('afterend', filterHtml);
}

// Calculation Logic for Add Van Fee
window.calculateVanFeeTotal = function() {
    const amount = parseFloat(document.getElementById('vanFeeAmount').value) || 0;
    const months = parseFloat(document.getElementById('vanFeeMonths').value) || 0;
    const totalInput = document.getElementById('vanFeeTotal');
    
    if(totalInput) {
        totalInput.value = amount * months;
    }
}

// Calculation Logic for Edit Van Fee
window.calculateEditVanFeeTotal = function() {
    const amount = parseFloat(document.getElementById('editVanFeeAmount').value) || 0;
    const months = parseFloat(document.getElementById('editVanFeeMonths').value) || 0;
    const totalInput = document.getElementById('editVanFeeTotal');
    
    if(totalInput) {
        totalInput.value = amount * months;
    }
}

// --- FEE CACHING & STUDENT FORM LOGIC ---
async function fetchFeeCache() {
    try {
        const classQ = query(collection(db, "class_fees"));
        const vanQ = query(collection(db, "van_fees"));
        const [classSnap, vanSnap] = await Promise.all([getDocs(classQ), getDocs(vanQ)]);
        
        allClassFees = [];
        classSnap.forEach(d => allClassFees.push({id: d.id, ...d.data()}));
        
        allVanFees = [];
        vanSnap.forEach(d => allVanFees.push({id: d.id, ...d.data()}));
        
        window.populatePincodeOptions();
    } catch(e) {
        console.error("Error caching fees:", e);
    }
}

window.updateStudentAcademicFee = function() {
    const cls = document.getElementById('newStudentClass').value;
    const sec = document.getElementById('newStudentSection').value;
    const feeInput = document.getElementById('newStudentAcademicFee');
    
    if(!cls) {
        feeInput.value = '';
        return;
    }

    const matched = allClassFees.filter(f => f.class === cls);
    
    let selectedFee = null;
    
    if (matched.length > 0) {
        const exact = matched.find(f => f.section === sec);
        if (exact) {
            selectedFee = exact;
        } else {
            matched.sort((a,b) => {
                if(a.year > b.year) return -1;
                if(a.year < b.year) return 1;
                return 0;
            });
            selectedFee = matched[0];
        }
    }

    if(selectedFee) {
        feeInput.value = selectedFee.amount;
    } else {
        feeInput.value = "Not Set";
    }
}

window.populatePincodeOptions = function() {
    const datalist = document.getElementById('pincodeList');
    if(!datalist) return;
    datalist.innerHTML = '';
    
    const uniquePins = [...new Set(allVanFees.map(f => f.pincode))];
    uniquePins.forEach(pin => {
        const opt = document.createElement('option');
        opt.value = pin;
        datalist.appendChild(opt);
    });
}

window.handleStudentPincodeChange = function() {
    const pin = document.getElementById('newStudentPincode').value;
    const placeSelect = document.getElementById('newStudentPlace');
    const vanFeeInput = document.getElementById('newStudentVanFee');
    
    placeSelect.innerHTML = '<option value="">Select Place</option>';
    vanFeeInput.value = '';

    if(!pin) return;

    const matchingFees = allVanFees.filter(f => f.pincode === pin);
    const uniquePlaces = [...new Set(matchingFees.map(f => f.place))];

    uniquePlaces.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        placeSelect.appendChild(opt);
    });
}

window.handleEditStudentPincodeChange = function() {
    const pin = document.getElementById('editStudentPincode').value;
    const placeSelect = document.getElementById('editStudentPlace');
    
    placeSelect.innerHTML = '<option value="">Select Place</option>';

    if(!pin) return;

    const matchingFees = allVanFees.filter(f => f.pincode === pin);
    const uniquePlaces = [...new Set(matchingFees.map(f => f.place))];

    uniquePlaces.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        placeSelect.appendChild(opt);
    });
}

window.handleStudentPlaceChange = function() {
    const pin = document.getElementById('newStudentPincode').value;
    const place = document.getElementById('newStudentPlace').value;
    const feeInput = document.getElementById('newStudentVanFee');

    if(!pin || !place) {
        feeInput.value = '';
        return;
    }

    const matched = allVanFees.filter(f => f.pincode === pin && f.place === place);
    if(matched.length > 0) {
        matched.sort((a,b) => (a.year > b.year ? -1 : 1));
        // Use totalAmount if available, else calculate monthly * 11
        if (matched[0].totalAmount) {
            feeInput.value = matched[0].totalAmount;
        } else {
            const monthly = parseFloat(matched[0].amount) || 0;
            feeInput.value = monthly * 11;
        }
    } else {
        feeInput.value = "Not Set";
    }
}


function getSectionsForClass(cls) {
    if (cls === '11' || cls === '12') {
        return ['GROUP1', 'GROUP2', 'GROUP3', 'GROUP4', 'GROUP5'];
    }
    return ['A', 'B', 'C', 'D'];
}

window.updateSectionOptions = function(classId, sectionId) {
    const clsInput = document.getElementById(classId);
    const secSelect = document.getElementById(sectionId);
    if (!clsInput || !secSelect) return;

    const cls = clsInput.value;
    const currentVal = secSelect.value;
    
    secSelect.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.innerText = (sectionId === 'tableFilterSection') ? "All Sections" : "Select Section";
    secSelect.appendChild(defaultOpt);

    if (!cls && sectionId !== 'tableFilterSection') return; 

    let sections = ['A', 'B', 'C', 'D']; 
    if (cls) {
        sections = getSectionsForClass(cls);
    }

    sections.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        if (s.startsWith('GROUP')) {
            opt.innerText = s;
        } else {
            opt.innerText = (sectionId === 'tableFilterSection') ? "Section " + s : s;
        }
        secSelect.appendChild(opt);
    });
    
    if(sections.includes(currentVal)) {
        secSelect.value = currentVal;
    }
}

// --- FEES LOGIC ---
function setupFeeListeners() {
    const saveClassFeeBtn = document.getElementById('saveClassFeeBtn');
    if (saveClassFeeBtn) {
        saveClassFeeBtn.addEventListener('click', saveClassFee);
    }

    const saveVanFeeBtn = document.getElementById('saveVanFeeBtn');
    if (saveVanFeeBtn) {
        saveVanFeeBtn.addEventListener('click', saveVanFee);
    }

    const updateClassFeeBtn = document.getElementById('updateClassFeeBtn');
    if (updateClassFeeBtn) {
        updateClassFeeBtn.addEventListener('click', updateClassFee);
    }

    const updateVanFeeBtn = document.getElementById('updateVanFeeBtn');
    if (updateVanFeeBtn) {
        updateVanFeeBtn.addEventListener('click', updateVanFee);
    }
}

function populateFeeYears(selectId) {
    const select = document.getElementById(selectId);
    if(!select) return;
    
    const date = new Date();
    const curY = date.getFullYear();
    const curM = date.getMonth(); 
    let baseYear = (curM < 5) ? curY - 1 : curY; 
    const years = [baseYear - 1, baseYear, baseYear + 1];
    
    select.innerHTML = '';
    years.forEach(y => {
        const val = `${y}-${y+1}`;
        const opt = document.createElement('option');
        opt.value = val;
        opt.text = val;
        if(y === baseYear) opt.selected = true;
        select.appendChild(opt);
    });
}

window.openAddClassFeeModal = function() {
    populateFeeYears('classFeeYear');
    document.getElementById('classFeeClass').value = '';
    document.getElementById('classFeeAmount').value = '';
    document.getElementById('classFeeSectionGroup').style.display = 'none';
    document.getElementById('classFeeSection').innerHTML = '';
    document.getElementById('addClassFeeModal').style.display = 'flex';
}

window.handleFeeClassChange = function() {
    const cls = document.getElementById('classFeeClass').value;
    const secGroup = document.getElementById('classFeeSectionGroup');
    const secSelect = document.getElementById('classFeeSection');
    
    if (cls === '11' || cls === '12') {
        secGroup.style.display = 'block';
        secSelect.innerHTML = '';
        ['GROUP1', 'GROUP2', 'GROUP3', 'GROUP4', 'GROUP5'].forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.text = g;
            secSelect.appendChild(opt);
        });
    } else {
        secGroup.style.display = 'none';
        secSelect.value = '';
    }
}

window.openAddVanFeeModal = function() {
    injectAddVanFeeFields(); // Ensure fields exist
    populateFeeYears('vanFeeYear'); 
    document.getElementById('vanFeePlace').value = '';
    document.getElementById('vanFeePincode').value = '';
    document.getElementById('vanFeeAmount').value = '';
    
    // Initialize defaults
    if(document.getElementById('vanFeeMonths')) {
        document.getElementById('vanFeeMonths').value = '11';
        document.getElementById('vanFeeTotal').value = '';
    }
    document.getElementById('addVanFeeModal').style.display = 'flex';
}

async function loadClassFees() {
    // Inject filter bar first
    injectFeeFilters('class-fees-view', 'ClassFee');

    const tbody = document.getElementById('classFeesTableBody');
    const loading = document.getElementById('class-fees-loading');
    
    tbody.innerHTML = '';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading records...';
    loading.style.display = 'block';

    try {
        const feesRef = collection(db, "class_fees");
        const snapshot = await getDocs(feesRef); // Fetch all to sort client-side properly

        currentClassFeesData = [];
        snapshot.forEach(doc => {
            currentClassFeesData.push({ id: doc.id, ...doc.data() });
        });

        // SORT: Class Rank ASC, then Year DESC
        currentClassFeesData.sort((a, b) => {
            const rankA = getClassRank(a.class);
            const rankB = getClassRank(b.class);
            if (rankA !== rankB) return rankA - rankB;
            // Year desc
            if (a.year < b.year) return 1;
            if (a.year > b.year) return -1;
            return 0;
        });

        document.getElementById('class-fees-loading').style.display = 'none';
        window.filterClassFees();

    } catch (e) {
        console.error("Error loading class fees:", e);
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading fees.</td></tr>';
        loading.style.display = 'none';
    }
}

window.filterClassFees = function() {
    const term = document.getElementById('searchClassFee').value.toLowerCase();
    const filtered = currentClassFeesData.filter(item => {
        const year = item.year ? item.year.toLowerCase() : '';
        const cls = item.class ? item.class.toLowerCase() : '';
        const amt = item.amount ? item.amount.toString() : '';
        const sec = item.section ? item.section.toLowerCase() : '';
        return year.includes(term) || cls.includes(term) || amt.includes(term) || sec.includes(term);
    });
    renderClassFeesTable(filtered);
}

window.resetClassFeeFilter = function() {
    document.getElementById('searchClassFee').value = '';
    window.filterClassFees();
}

function renderClassFeesTable(data) {
    const tbody = document.getElementById('classFeesTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No class fees found.</td></tr>';
        return;
    }

    data.forEach(item => {
        const safeData = encodeURIComponent(JSON.stringify(item));
        let classDisplay = item.class;
        if(item.section) {
            classDisplay += ` (${item.section})`;
        }
        const row = `
            <tr>
                <td>${item.year}</td>
                <td>${classDisplay}</td>
                <td>₹ ${item.amount}</td>
                <td>
                    <div class="action-icons">
                        <i class="fas fa-edit btn-edit" onclick="window.openEditFeeModal('class_fees', '${item.id}', '${safeData}')" title="Edit"></i>
                        <i class="fas fa-trash-alt btn-delete" onclick="window.deleteFee('class_fees', '${item.id}')" title="Delete"></i>
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

async function loadVanFees() {
    // Inject filter bar
    injectFeeFilters('van-fees-view', 'VanFee');

    const tbody = document.getElementById('vanFeesTableBody');
    const loading = document.getElementById('van-fees-loading');
    
    tbody.innerHTML = '';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading records...';
    loading.style.display = 'block';

    try {
        const feesRef = collection(db, "van_fees");
        const snapshot = await getDocs(feesRef);

        currentVanFeesData = [];
        snapshot.forEach(doc => {
            currentVanFeesData.push({ id: doc.id, ...doc.data() });
        });

        // SORT: Pincode ASC
        currentVanFeesData.sort((a, b) => {
            const pinA = parseInt(a.pincode) || 999999;
            const pinB = parseInt(b.pincode) || 999999;
            return pinA - pinB;
        });

        document.getElementById('van-fees-loading').style.display = 'none';
        window.filterVanFees();

    } catch (e) {
        console.error("Error loading van fees:", e);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading fees.</td></tr>';
        loading.style.display = 'none';
    }
}

window.filterVanFees = function() {
    const term = document.getElementById('searchVanFee').value.toLowerCase();
    const filtered = currentVanFeesData.filter(item => {
        const year = item.year ? item.year.toLowerCase() : '';
        const place = item.place ? item.place.toLowerCase() : '';
        const pin = item.pincode ? item.pincode.toString() : '';
        const amt = item.amount ? item.amount.toString() : '';
        return year.includes(term) || place.includes(term) || pin.includes(term) || amt.includes(term);
    });
    renderVanFeesTable(filtered);
}

window.resetVanFeeFilter = function() {
    document.getElementById('searchVanFee').value = '';
    window.filterVanFees();
}

function renderVanFeesTable(data) {
    const tbody = document.getElementById('vanFeesTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No van fees found.</td></tr>';
        return;
    }

    data.forEach(item => {
        const safeData = encodeURIComponent(JSON.stringify(item));
        const row = `
            <tr>
                <td>${item.year}</td>
                <td>${item.place}</td>
                <td>${item.pincode}</td>
                <td>₹ ${item.amount}</td>
                <td>
                    <div class="action-icons">
                        <i class="fas fa-edit btn-edit" onclick="window.openEditFeeModal('van_fees', '${item.id}', '${safeData}')" title="Edit"></i>
                        <i class="fas fa-trash-alt btn-delete" onclick="window.deleteFee('van_fees', '${item.id}')" title="Delete"></i>
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

async function saveClassFee() {
    const year = document.getElementById('classFeeYear').value;
    const cls = document.getElementById('classFeeClass').value;
    const amount = document.getElementById('classFeeAmount').value;
    const secSelect = document.getElementById('classFeeSection');
    const section = (secSelect && secSelect.value) ? secSelect.value : '';
    const btn = document.getElementById('saveClassFeeBtn');

    if (!year || !cls || !amount) {
        window.showPopupAlert("Error", "Please fill all fields.");
        return;
    }
    if ((cls === '11' || cls === '12') && !section) {
        window.showPopupAlert("Error", "Please select a Section/Group.");
        return;
    }

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const docData = { year, class: cls, amount, createdAt: new Date() };
        if(section) docData.section = section;

        await addDoc(collection(db, "class_fees"), docData);
        window.showPopupAlert("Success", "Class Fee added successfully!");
        document.getElementById('addClassFeeModal').style.display = 'none';
        
        document.getElementById('classFeeYear').value = '';
        document.getElementById('classFeeClass').value = '';
        document.getElementById('classFeeAmount').value = '';
        if(secSelect) secSelect.value = '';
        
        loadClassFees();
        fetchFeeCache(); // Update Cache
    } catch (e) {
        console.error(e);
        window.showPopupAlert("Error", "Failed to add fee: " + e.message);
    } finally {
        btn.innerText = "Save Fee";
        btn.disabled = false;
    }
}

async function saveVanFee() {
    const year = document.getElementById('vanFeeYear').value;
    const place = document.getElementById('vanFeePlace').value;
    const pincode = document.getElementById('vanFeePincode').value;
    const amount = document.getElementById('vanFeeAmount').value;
    
    // New Fields
    const months = document.getElementById('vanFeeMonths') ? document.getElementById('vanFeeMonths').value : '11';
    const total = document.getElementById('vanFeeTotal') ? document.getElementById('vanFeeTotal').value : '';

    const btn = document.getElementById('saveVanFeeBtn');

    if (!year || !place || !pincode || !amount) {
        window.showPopupAlert("Error", "Please fill all fields.");
        return;
    }
    if (!/^\d{6}$/.test(pincode)) {
        window.showPopupAlert("Error", "Pincode must be exactly 6 digits.");
        return;
    }

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        await addDoc(collection(db, "van_fees"), { 
            year, place, pincode, amount, 
            months: months, 
            totalAmount: total,
            createdAt: new Date() 
        });
        window.showPopupAlert("Success", "Van Fee added successfully!");
        document.getElementById('addVanFeeModal').style.display = 'none';
        
        document.getElementById('vanFeeYear').value = '';
        document.getElementById('vanFeePlace').value = '';
        document.getElementById('vanFeePincode').value = '';
        document.getElementById('vanFeeAmount').value = '';
        if(document.getElementById('vanFeeMonths')) document.getElementById('vanFeeMonths').value = '11';
        if(document.getElementById('vanFeeTotal')) document.getElementById('vanFeeTotal').value = '';

        loadVanFees();
        fetchFeeCache(); // Update Cache
    } catch (e) {
        console.error(e);
        window.showPopupAlert("Error", "Failed to add fee: " + e.message);
    } finally {
        btn.innerText = "Save Fee";
        btn.disabled = false;
    }
}

window.openEditFeeModal = function(collectionName, docId, encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    
    if (collectionName === 'class_fees') {
        document.getElementById('editClassFeeId').value = docId;
        document.getElementById('editClassFeeYear').value = data.year;
        document.getElementById('editClassFeeClass').value = data.class;
        document.getElementById('editClassFeeAmount').value = data.amount;
        document.getElementById('editClassFeeModal').style.display = 'flex';
    } else {
        // Van Fees - Inject new fields first
        injectEditVanFeeFields();
        
        document.getElementById('editVanFeeId').value = docId;
        document.getElementById('editVanFeeYear').value = data.year;
        document.getElementById('editVanFeePlace').value = data.place;
        document.getElementById('editVanFeePincode').value = data.pincode;
        document.getElementById('editVanFeeAmount').value = data.amount;
        
        // Populate new fields
        const months = data.months || 11;
        document.getElementById('editVanFeeMonths').value = months;
        
        if (data.totalAmount) {
             document.getElementById('editVanFeeTotal').value = data.totalAmount;
        } else {
             window.calculateEditVanFeeTotal();
        }

        document.getElementById('editVanFeeModal').style.display = 'flex';
    }
}

async function updateClassFee() {
    const id = document.getElementById('editClassFeeId').value;
    const year = document.getElementById('editClassFeeYear').value;
    const cls = document.getElementById('editClassFeeClass').value;
    const amount = document.getElementById('editClassFeeAmount').value;
    const btn = document.getElementById('updateClassFeeBtn');

    if (!year || !cls || !amount) {
        window.showPopupAlert("Error", "Please fill all fields.");
        return;
    }

    btn.innerText = "Updating...";
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "class_fees", id), { year, class: cls, amount });
        window.showPopupAlert("Success", "Class Fee updated successfully!");
        document.getElementById('editClassFeeModal').style.display = 'none';
        loadClassFees();
        fetchFeeCache();
    } catch (e) {
        console.error(e);
        window.showPopupAlert("Error", "Failed to update fee: " + e.message);
    } finally {
        btn.innerText = "Update Fee";
        btn.disabled = false;
    }
}

async function updateVanFee() {
    const id = document.getElementById('editVanFeeId').value;
    const year = document.getElementById('editVanFeeYear').value;
    const place = document.getElementById('editVanFeePlace').value;
    const pincode = document.getElementById('editVanFeePincode').value;
    const amount = document.getElementById('editVanFeeAmount').value;
    
    // New fields
    const months = document.getElementById('editVanFeeMonths').value;
    const totalAmount = document.getElementById('editVanFeeTotal').value;

    const btn = document.getElementById('updateVanFeeBtn');

    if (!year || !place || !pincode || !amount) {
        window.showPopupAlert("Error", "Please fill all fields.");
        return;
    }
    if (!/^\d{6}$/.test(pincode)) {
        window.showPopupAlert("Error", "Pincode must be exactly 6 digits.");
        return;
    }

    btn.innerText = "Updating...";
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "van_fees", id), { 
            year, place, pincode, amount, 
            months: months, 
            totalAmount: totalAmount 
        });
        window.showPopupAlert("Success", "Van Fee updated successfully!");
        document.getElementById('editVanFeeModal').style.display = 'none';
        loadVanFees();
        fetchFeeCache();
    } catch (e) {
        console.error(e);
        window.showPopupAlert("Error", "Failed to update fee: " + e.message);
    } finally {
        btn.innerText = "Update Fee";
        btn.disabled = false;
    }
}

window.deleteFee = function(collectionName, docId) {
    window.showPopupConfirm("Delete Fee", "Are you sure you want to delete this fee record?", async () => {
        try {
            await deleteDoc(doc(db, collectionName, docId));
            window.showPopupAlert("Success", "Fee record deleted.");
            if (collectionName === 'class_fees') loadClassFees();
            else loadVanFees();
            fetchFeeCache();
        } catch (e) {
            window.showPopupAlert("Error", "Failed to delete: " + e.message);
        }
    });
}

// --- SEARCH, FILTER & SORT LOGIC ---
function setupSearchListeners() {
    const searchInput = document.getElementById('tableSearchInput');
    const filterClass = document.getElementById('tableFilterClass');
    const filterSection = document.getElementById('tableFilterSection');

    if(searchInput) searchInput.addEventListener('input', filterUsers);
    
    if(filterClass) {
        filterClass.addEventListener('change', () => {
            window.updateSectionOptions('tableFilterClass', 'tableFilterSection');
            filterUsers();
        });
    }
    
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
        const idMatch = user.customId && user.customId.toLowerCase().includes(searchTerm);
        const nameMatch = user.name && user.name.toLowerCase().includes(searchTerm);
        const phoneMatch = user.phone && user.phone.includes(searchTerm);
        const matchesSearch = !searchTerm || idMatch || nameMatch || phoneMatch;
        const matchesClass = !filterClass || (user.studentClass === filterClass);
        const matchesSection = !filterSection || (user.section === filterSection);
        return matchesSearch && matchesClass && matchesSection;
    });

    filteredData.sort((a, b) => {
        const rankA = getClassRank(a.studentClass);
        const rankB = getClassRank(b.studentClass);
        if (rankA !== rankB) return rankA - rankB;
        const secA = a.section || '';
        const secB = b.section || '';
        if (secA < secB) return -1;
        if (secA > secB) return 1;
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
    document.getElementById('tableFilterSection').innerHTML = '<option value="">All Sections</option>';
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
async function generateUserId(role, stClass = '', section = '') {
    const date = new Date();
    const shortYear = date.getFullYear().toString().slice(-2); 

    let fullPrefix = "";

    if (role.toLowerCase() === 'student') {
        const cls = stClass ? stClass.toString().trim().toUpperCase() : 'NA';
        let sec = section ? section.toString().trim().toUpperCase() : 'NA';
        
        // NEW LOGIC: Map GROUP1-5 to G1-5
        if (sec.startsWith('GROUP')) {
            sec = sec.replace('GROUP', 'G');
        }

        fullPrefix = `STSS${shortYear}${cls}${sec}`; 
    } else {
        let rolePrefix = "US";
        switch(role.toLowerCase()) {
            case 'admin': rolePrefix = "AD"; break;
            case 'staff': rolePrefix = "SF"; break;
            case 'manager': rolePrefix = "MR"; break;
            case 'principal': rolePrefix = "PR"; break;
        }
        fullPrefix = `${rolePrefix}SS${shortYear}`;
    }

    if (idCounters[fullPrefix] === undefined) {
        const usersRef = collection(db, "users");
        
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
                const numPartStr = data.customId.substring(fullPrefix.length);
                const num = parseInt(numPartStr);
                if (!isNaN(num) && num > maxSeq) {
                    maxSeq = num;
                }
            }
        });
        idCounters[fullPrefix] = maxSeq;
    }

    idCounters[fullPrefix]++;
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
    
    // Dynamically Populate Section Grid
    const container = document.getElementById('sectionGrid');
    container.innerHTML = ''; // Clear existing

    // 'All' Card
    const allDiv = document.createElement('div');
    allDiv.className = 'section-card';
    allDiv.onclick = () => window.selectSection('All');
    allDiv.innerHTML = `<div class="section-avatar section-all-avatar"><i class="fas fa-users"></i></div><h3>All Sections</h3>`;
    container.appendChild(allDiv);

    // Dynamic Cards
    const sections = getSectionsForClass(className);
    sections.forEach(sec => {
        const div = document.createElement('div');
        div.className = 'section-card';
        div.onclick = () => window.selectSection(sec);
        
        let displayAvatar = sec;
        if(sec.startsWith('GROUP')) displayAvatar = sec.replace('GROUP', 'G');

        let displayTitle = sec.startsWith('GROUP') ? sec : `Section ${sec}`;

        div.innerHTML = `<div class="section-avatar">${displayAvatar}</div><h3>${displayTitle}</h3>`;
        container.appendChild(div);
    });

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

        const headers = ["ID", "Name", "Email", "Phone", "DOB", "Role", "Class", "Section", "Pincode", "Place"];
        
        const rows = currentFetchedUsers.map(user => {
            const customId = user.customId || "";
            const name = user.name || "";
            const email = user.email || "";
            const phone = user.phone || "";
            const dob = user.dob || "";
            const role = user.role || "";
            const stClass = user.studentClass || "";
            const section = user.section || "";
            const pincode = user.pincode || "";
            const place = user.place || "";
            return `"${customId}","${name}","${email}","${phone}","${dob}","${role}","${stClass}","${section}","${pincode}","${place}"`;
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

            let name, email, phone, dob, role, stClass, section, pincode, place;
            
            if(cleanCols.length >= 10) {
                [, name, email, phone, dob, role, stClass, section, pincode, place] = cleanCols;
            } else if (cleanCols.length >= 8) {
                [, name, email, phone, dob, role, stClass, section] = cleanCols;
                pincode = "";
                place = "";
            } else {
                [name, email, phone, dob, role, stClass, section] = cleanCols;
                pincode = "";
                place = "";
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

            // --- UPDATED: AUTO-CALCULATE FEES LOGIC ---
            let academicFee = "0";
            let vanFee = "0";

            if (role.toLowerCase() === 'student') {
                // 1. Calculate Academic Fee
                if (stClass) {
                    const matchedClass = allClassFees.filter(f => f.class === stClass);
                    if(matchedClass.length > 0) {
                        const exactSec = matchedClass.find(f => f.section === section);
                        if (exactSec) {
                            academicFee = exactSec.amount;
                        } else {
                            matchedClass.sort((a,b) => (a.year > b.year ? -1 : 1));
                            academicFee = matchedClass[0].amount;
                        }
                    } else {
                        academicFee = "Not Set";
                    }
                }

                // 2. Calculate Van Fee
                if (pincode && place) {
                    const matchedVan = allVanFees.filter(f => f.pincode === pincode && f.place.toLowerCase() === place.toLowerCase());
                    if (matchedVan.length > 0) {
                        matchedVan.sort((a,b) => (a.year > b.year ? -1 : 1));
                        // UPDATED: Save Total Amount if available
                        if(matchedVan[0].totalAmount) {
                            vanFee = matchedVan[0].totalAmount;
                        } else {
                            const monthly = parseFloat(matchedVan[0].amount) || 0;
                            vanFee = (monthly * 11).toString();
                        }
                    } else {
                        vanFee = "Not Set";
                    }
                }
            }
            // --- END AUTO-CALCULATE ---

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
                
                if (pincode) userData.pincode = pincode;
                if (place) userData.place = place;
                if (role.toLowerCase() === 'student') {
                    userData.academicFee = academicFee;
                    userData.vanFee = vanFee;
                }

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
    injectEditStudentFields(); // Ensure new fields are present in DOM
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
        
        // Trigger update to populate sections correctly for the class
        window.updateSectionOptions('editStudentClass', 'editStudentSection');
        document.getElementById('editStudentSection').value = user.section || '';

        // Populate Pincode and Trigger Place Load
        document.getElementById('editStudentPincode').value = user.pincode || '';
        window.handleEditStudentPincodeChange(); // Load places based on pin
        
        // Set Place after options loaded
        document.getElementById('editStudentPlace').value = user.place || '';
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
        let pincode = null;
        let place = null;

        if (role === 'student') {
            studentClass = document.getElementById('editStudentClass').value;
            section = document.getElementById('editStudentSection').value;
            pincode = document.getElementById('editStudentPincode').value;
            place = document.getElementById('editStudentPlace').value;
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
                updateData.pincode = pincode;
                updateData.place = place;
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
    document.getElementById('newStudentSection').innerHTML = '<option value="">Select Section</option>'; 
    document.getElementById('newStudentSection').value = '';
    document.getElementById('newStudentPincode').value = '';
    document.getElementById('newStudentPlace').innerHTML = '<option value="">Select Place</option>';
    document.getElementById('newStudentAcademicFee').value = '';
    document.getElementById('newStudentVanFee').value = '';

    window.populatePincodeOptions();

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
            window.updateSectionOptions('newStudentClass', 'newStudentSection');
            window.updateStudentAcademicFee();
        }
        if(currentStudentSection && currentStudentSection !== 'All') {
            document.getElementById('newStudentSection').value = currentStudentSection;
            window.updateStudentAcademicFee();
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
        const pincode = document.getElementById('newStudentPincode').value;
        const place = document.getElementById('newStudentPlace').value;
        const academicFee = document.getElementById('newStudentAcademicFee').value;
        const vanFee = document.getElementById('newStudentVanFee').value;

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
                userData.pincode = pincode || '';
                userData.place = place || '';
                userData.academicFee = academicFee || '';
                userData.vanFee = vanFee || '';
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