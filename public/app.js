// ====== STATE ======
let state = {
    waterIntake: [],
    foodLog: [],
    waterTarget: 3000,
    baseWaterTarget: 3000,
    settings: {
        stoneType: 'calcium_oxalate',
        weight: 70,
        reminderEnabled: false,
        reminderInterval: 60,
        reminderStart: '07:00',
        reminderEnd: '22:00'
    }
};

let selectedFood = null;
let reminderTimer = null;
let analyzedFoodData = null;

// ====== INIT ======
document.addEventListener('DOMContentLoaded', function() {
    loadState();
    initTabs();
    initDashboard();
    initFoodSearch();
    initWaterTracker();
    initFoodGuide();
    initProgress();
    initModals();
    initSettings();
    initPhotoAnalyzer();
    updateAll();
    setDailyTip();
    startAutoReminder();
    checkDayReset();
    setInterval(saveState, 30000);
});

// ====== STORAGE ======
function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

function loadState() {
    var today = getTodayKey();
    var saved = localStorage.getItem('kidneycare_' + today);
    if (saved) {
        var parsed = JSON.parse(saved);
        state.waterIntake = parsed.waterIntake || [];
        state.foodLog = parsed.foodLog || [];
    }
    var settings = localStorage.getItem('kidneycare_settings');
    if (settings) {
        state.settings = Object.assign({}, state.settings, JSON.parse(settings));
    }
    state.baseWaterTarget = state.settings.baseWaterTarget || 3000;
    state.waterTarget = state.baseWaterTarget;
}

function saveState() {
    var today = getTodayKey();
    localStorage.setItem('kidneycare_' + today, JSON.stringify({
        waterIntake: state.waterIntake,
        foodLog: state.foodLog,
        waterTarget: state.waterTarget,
        date: today
    }));
    localStorage.setItem('kidneycare_settings', JSON.stringify(state.settings));
}

function checkDayReset() {
    var today = getTodayKey();
    var lastDate = localStorage.getItem('kidneycare_lastDate');
    if (lastDate && lastDate !== today) {
        archiveDay(lastDate);
    }
    localStorage.setItem('kidneycare_lastDate', today);
}

function archiveDay(date) {
    var data = localStorage.getItem('kidneycare_' + date);
    if (data) {
        var history = JSON.parse(localStorage.getItem('kidneycare_history') || '[]');
        var parsed = JSON.parse(data);
        history.push({
            date: date,
            totalWater: parsed.waterIntake.reduce(function(s, w) { return s + w.amount; }, 0),
            waterTarget: parsed.waterTarget || 3000,
            foodCount: parsed.foodLog.length,
            riskScore: calculateRiskFromLog(parsed.foodLog)
        });
        if (history.length > 90) history = history.slice(-90);
        localStorage.setItem('kidneycare_history', JSON.stringify(history));
    }
}

// ====== TABS ======
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(function(c) {
                c.classList.remove('active');
            });
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
    var now = new Date();
    document.getElementById('currentDate').textContent =
        now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ====== DASHBOARD ======
function initDashboard() {
    document.getElementById('quickAddWater').addEventListener('click', function() {
        addWater(250);
    });
}

function updateDashboard() {
    updateWaterCircle();
    updateRiskMeter();
    updateDashFoodSummary();
    updateAlerts();
}

function updateWaterCircle() {
    var total = getTotalWater();
    var target = state.waterTarget;
    var percent = Math.min((total / target) * 100, 100);
    var offset = 565 - (percent / 100) * 565;
    document.getElementById('waterProgress').style.strokeDashoffset = offset;
    document.getElementById('dashWaterAmount').textContent = total;
    document.getElementById('dashWaterTarget').textContent = target;
    var circle = document.getElementById('waterProgress');
    if (percent >= 100) circle.style.stroke = '#4CAF50';
    else if (percent >= 60) circle.style.stroke = '#2196F3';
    else if (percent >= 30) circle.style.stroke = '#FF9800';
    else circle.style.stroke = '#F44336';
}

function updateRiskMeter() {
    var risk = calculateTodayRisk();
    var riskPercent = Math.min(risk, 100);
    document.getElementById('riskFill').style.left = riskPercent + '%';
    var riskText = document.getElementById('riskText');
    if (state.foodLog.length === 0) {
        riskText.textContent = 'Log your food to see risk analysis';
        riskText.style.color = '#546E7A';
    } else if (riskPercent < 30) {
        riskText.textContent = 'Low Risk - Great food choices today!';
        riskText.style.color = '#4CAF50';
    } else if (riskPercent < 60) {
        riskText.textContent = 'Moderate Risk - Watch your intake';
        riskText.style.color = '#FF9800';
    } else {
        riskText.textContent = 'High Risk - Too many high-oxalate foods!';
        riskText.style.color = '#F44336';
    }
}

function updateDashFoodSummary() {
    var container = document.getElementById('dashFoodSummary');
    if (state.foodLog.length === 0) {
        container.innerHTML = '<p class="empty-state">No food logged today. Start tracking!</p>';
        return;
    }
    container.innerHTML = state.foodLog.map(function(entry) {
        return '<div class="dash-food-item ' + entry.status + '">' +
            '<span>' + entry.name + ' (' + entry.meal + ')</span>' +
            '<span class="status-badge ' + entry.status + '">' + entry.status + '</span>' +
            '</div>';
    }).join('');
}

function updateAlerts() {
    var alerts = [];
    var totalWater = getTotalWater();
    var hour = new Date().getHours();
    if (hour >= 12 && totalWater < 1000) alerts.push('Less than 1L water - its past noon!');
    if (hour >= 18 && totalWater < 2000) alerts.push('Evening - drink more water today!');
    var totalOxalate = state.foodLog.reduce(function(s, f) { return s + (f.oxalate * f.servings); }, 0);
    if (totalOxalate > 50) alerts.push('High oxalate: ' + totalOxalate.toFixed(0) + 'mg - drink extra water!');
    var totalSodium = state.foodLog.reduce(function(s, f) { return s + (f.sodium * f.servings); }, 0);
    if (totalSodium > 2300) alerts.push('High sodium: ' + totalSodium.toFixed(0) + 'mg - increases stone risk!');
    var avoidFoods = state.foodLog.filter(function(f) { return f.status === 'avoid'; });
    if (avoidFoods.length > 0) {
        alerts.push('You ate foods to avoid: ' + avoidFoods.map(function(f) { return f.name; }).join(', '));
    }
    var card = document.getElementById('alertsCard');
    var list = document.getElementById('alertsList');
    if (alerts.length > 0) {
        card.style.display = 'block';
        list.innerHTML = alerts.map(function(a) {
            return '<div class="alert-item">' + a + '</div>';
        }).join('');
    } else {
        card.style.display = 'none';
    }
}

function setDailyTip() {
    var day = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    document.getElementById('dailyTip').textContent = DAILY_TIPS[day % DAILY_TIPS.length];
}

// ====== FOOD SEARCH ======
function initFoodSearch() {
    var searchInput = document.getElementById('foodSearch');
    var searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', function() {
        var query = this.value.toLowerCase().trim();
        if (query.length < 2) { searchResults.style.display = 'none'; return; }
        var results = FOOD_DATABASE.filter(function(f) {
            return f.name.toLowerCase().includes(query) || f.category.toLowerCase().includes(query);
        }).slice(0, 15);
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><span>No foods found</span></div>';
        } else {
            searchResults.innerHTML = results.map(function(food) {
                return '<div class="search-result-item" data-food-id="' + food.id + '">' +
                    '<div><div class="result-name">' + food.name + '</div>' +
                    '<div class="result-category">' + food.category + ' - Oxalate: ' + food.oxalate + 'mg</div></div>' +
                    '<span class="status-badge ' + food.status + '">' + food.status + '</span></div>';
            }).join('');
        }
        searchResults.style.display = 'block';
    });

    searchResults.addEventListener('click', function(e) {
        var item = e.target.closest('.search-result-item');
        if (item && item.dataset.foodId) {
            var food = FOOD_DATABASE.find(function(f) { return f.id === parseInt(item.dataset.foodId); });
            if (food) { showFoodDetail(food); searchResults.style.display = 'none'; searchInput.value = ''; }
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) searchResults.style.display = 'none';
    });

    document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            renderFoodLog(btn.dataset.meal);
        });
    });
}

function showFoodDetail(food) {
    selectedFood = food;
    document.getElementById('modalFoodName').textContent = food.name;
    var statusLabel = food.status === 'safe' ? 'SAFE TO EAT' : food.status === 'moderate' ? 'EAT IN MODERATION' : 'AVOID';
    var altHTML = '';
    if (food.alternatives && food.alternatives.length > 0) {
        altHTML = '<div class="food-detail-alternatives"><h4>Better Alternatives:</h4>' +
            food.alternatives.map(function(a) { return '<span class="alt-tag">' + a + '</span>'; }).join('') + '</div>';
    }
    var oxColor = food.oxalate > 50 ? '#F44336' : food.oxalate > 20 ? '#FF9800' : '#4CAF50';
    var naColor = food.sodium > 400 ? '#F44336' : food.sodium > 200 ? '#FF9800' : '#4CAF50';
    document.getElementById('modalBody').innerHTML =
        '<div class="food-detail-status ' + food.status + '">' + statusLabel + '</div>' +
        '<div class="food-detail-reason"><strong>Why:</strong> ' + food.reason + '</div>' +
        '<div class="food-detail-nutrients">' +
        '<div class="nutrient-badge"><span class="value" style="color:' + oxColor + '">' + food.oxalate + '</span><span class="label">Oxalate mg</span></div>' +
        '<div class="nutrient-badge"><span class="value" style="color:' + naColor + '">' + food.sodium + '</span><span class="label">Sodium mg</span></div>' +
        '<div class="nutrient-badge"><span class="value">' + food.calcium + '</span><span class="label">Calcium mg</span></div>' +
        '<div class="nutrient-badge"><span class="value">' + food.protein + '</span><span class="label">Protein g</span></div>' +
        '</div>' +
        '<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;">Per serving: ' + food.serving + '</p>' +
        '<div class="food-detail-tips"><strong>Tip:</strong> ' + food.tips + '</div>' + altHTML;
    var hour = new Date().getHours();
    var mealSelect = document.getElementById('mealSelect');
    if (hour < 11) mealSelect.value = 'breakfast';
    else if (hour < 15) mealSelect.value = 'lunch';
    else if (hour < 18) mealSelect.value = 'snack';
    else mealSelect.value = 'dinner';
    document.getElementById('servingAmount').value = 1;
    document.getElementById('foodDetailModal').classList.add('active');
}

function addFoodToLog() {
    if (!selectedFood) return;
    var meal = document.getElementById('mealSelect').value;
    var servings = parseFloat(document.getElementById('servingAmount').value) || 1;
    var entry = {
        id: Date.now(),
        name: selectedFood.name,
        status: selectedFood.status,
        meal: meal,
        servings: servings,
        oxalate: selectedFood.oxalate,
        sodium: selectedFood.sodium,
        calcium: selectedFood.calcium,
        protein: selectedFood.protein,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
    state.foodLog.push(entry);
    saveState();
    adjustWaterTarget();
    updateAll();
    document.getElementById('foodDetailModal').classList.remove('active');
    showToast(entry.name + ' added to ' + meal);
    if (entry.status === 'avoid') {
        setTimeout(function() { showToast('Warning: This food is not recommended! Drink extra water!'); }, 2000);
    }
}

function removeFoodFromLog(entryId) {
    state.foodLog = state.foodLog.filter(function(f) { return f.id !== entryId; });
    saveState();
    adjustWaterTarget();
    updateAll();
    showToast('Food entry removed');
}

function renderFoodLog(filter) {
    if (!filter) filter = 'all';
    var container = document.getElementById('foodLogList');
    var entries = filter === 'all' ? state.foodLog : state.foodLog.filter(function(f) { return f.meal === filter; });
    if (entries.length === 0) {
        container.innerHTML = '<p class="empty-state">No food logged yet</p>';
        return;
    }
    container.innerHTML = entries.map(function(entry) {
        return '<div class="food-log-entry ' + entry.status + '">' +
            '<div class="log-entry-info">' +
            '<div class="log-entry-name">' + entry.name + '</div>' +
            '<div class="log-entry-details">' + entry.servings + 'x - Oxalate: ' +
            (entry.oxalate * entry.servings).toFixed(0) + 'mg - Sodium: ' +
            (entry.sodium * entry.servings).toFixed(0) + 'mg</div>' +
            '<div class="log-entry-time">' + entry.time + ' - ' + entry.meal + '</div>' +
            '</div>' +
            '<button class="log-entry-delete" onclick="removeFoodFromLog(' + entry.id + ')">X</button>' +
            '</div>';
    }).join('');
}

function updateNutrientBars() {
    var totals = state.foodLog.reduce(function(acc, f) {
        return {
            oxalate: acc.oxalate + (f.oxalate * f.servings),
            sodium: acc.sodium + (f.sodium * f.servings),
            calcium: acc.calcium + (f.calcium * f.servings),
            protein: acc.protein + (f.protein * f.servings)
        };
    }, { oxalate: 0, sodium: 0, calcium: 0, protein: 0 });
    document.getElementById('oxalateFill').style.width = Math.min((totals.oxalate / 50) * 100, 100) + '%';
    document.getElementById('oxalateValue').textContent = totals.oxalate.toFixed(0) + ' mg';
    document.getElementById('sodiumFill').style.width = Math.min((totals.sodium / 2300) * 100, 100) + '%';
    document.getElementById('sodiumValue').textContent = totals.sodium.toFixed(0) + ' mg';
    document.getElementById('calciumFill').style.width = Math.min((totals.calcium / 1000) * 100, 100) + '%';
    document.getElementById('calciumValue').textContent = totals.calcium.toFixed(0) + ' mg';
    document.getElementById('proteinFill').style.width = Math.min((totals.protein / 56) * 100, 100) + '%';
    document.getElementById('proteinValue').textContent = totals.protein.toFixed(0) + ' g';
}

// ====== WATER TARGET ======
function adjustWaterTarget() {
    var target = state.baseWaterTarget;
    var reasons = [];
    var totals = state.foodLog.reduce(function(acc, f) {
        return { oxalate: acc.oxalate + (f.oxalate * f.servings), sodium: acc.sodium + (f.sodium * f.servings) };
    }, { oxalate: 0, sodium: 0 });
    if (totals.oxalate > 50) {
        var extra = Math.min(Math.floor((totals.oxalate - 50) / 25) * 250, 1000);
        target += extra;
        reasons.push('+' + extra + 'ml for high oxalate');
    }
    if (totals.sodium > 1500) {
        var extra2 = Math.min(Math.floor((totals.sodium - 1500) / 500) * 250, 750);
        target += extra2;
        reasons.push('+' + extra2 + 'ml for high sodium');
    }
    var avoidCount = state.foodLog.filter(function(f) { return f.status === 'avoid'; }).length;
    if (avoidCount > 0) {
        var extra3 = avoidCount * 250;
        target += extra3;
        reasons.push('+' + extra3 + 'ml for avoid foods');
    }
    state.waterTarget = target;
    var note = document.getElementById('waterAdjustedNote');
    note.textContent = reasons.length > 0 ? 'Target adjusted: ' + reasons.join(', ') : '';
    document.getElementById('waterTargetDisplay').textContent = target + ' ml';
    document.getElementById('dashWaterTarget').textContent = target;
    saveState();
}

// ====== WATER TRACKER ======
function initWaterTracker() {
    document.querySelectorAll('.btn-water').forEach(function(btn) {
        btn.addEventListener('click', function() { addWater(parseInt(btn.dataset.amount)); });
    });
    document.getElementById('addCustomWater').addEventListener('click', function() {
        var amount = parseInt(document.getElementById('customWaterAmount').value);
        if (amount > 0) { addWater(amount); document.getElementById('customWaterAmount').value = ''; }
    });
    document.getElementById('customWaterAmount').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('addCustomWater').click();
    });
    document.getElementById('undoWater').addEventListener('click', function() {
        if (state.waterIntake.length > 0) {
            var removed = state.waterIntake.pop();
            saveState(); updateAll();
            showToast('Removed ' + removed.amount + 'ml');
        }
    });
    document.getElementById('enableReminders').addEventListener('change', function() {
        state.settings.reminderEnabled = this.checked;
        saveState();
        if (this.checked) { requestNotificationPermission(); startAutoReminder(); showToast('Reminders enabled!'); }
        else { stopAutoReminder(); showToast('Reminders disabled'); }
    });
    document.getElementById('reminderInterval').addEventListener('change', function() {
        state.settings.reminderInterval = parseInt(this.value);
        saveState();
        if (state.settings.reminderEnabled) { stopAutoReminder(); startAutoReminder(); }
    });
    document.getElementById('enableReminders').checked = state.settings.reminderEnabled;
    document.getElementById('reminderInterval').value = state.settings.reminderInterval;
    document.getElementById('reminderStart').value = state.settings.reminderStart || '07:00';
    document.getElementById('reminderEnd').value = state.settings.reminderEnd || '22:00';
}

function addWater(amount) {
    state.waterIntake.push({
        amount: amount,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
    });
    saveState(); updateAll();
    var total = getTotalWater();
    if (total >= state.waterTarget) showToast('You reached your water target!');
    else showToast('+' + amount + 'ml added! Total: ' + total + 'ml');
}

function getTotalWater() {
    return state.waterIntake.reduce(function(s, w) { return s + w.amount; }, 0);
}

function updateWaterTracker() {
    var total = getTotalWater();
    var percent = Math.min((total / state.waterTarget) * 100, 100);
    document.getElementById('waterTotal').textContent = total + ' ml';
    document.getElementById('waterTargetDisplay').textContent = state.waterTarget + ' ml';
    document.getElementById('bottleFill').style.height = percent + '%';
    var log = document.getElementById('waterLog');
    if (state.waterIntake.length === 0) {
        log.innerHTML = '<p class="empty-state">No water logged yet</p>';
    } else {
        log.innerHTML = state.waterIntake.slice().reverse().map(function(w) {
            return '<div class="water-log-item"><span>' + w.amount + ' ml</span><span>' + w.time + '</span></div>';
        }).join('');
    }
}

// ====== NOTIFICATIONS ======
function requestNotificationPermission() {
    if ('Notification' in window) Notification.requestPermission();
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body });
}

function startAutoReminder() {
    if (!state.settings.reminderEnabled) return;
    stopAutoReminder();
    reminderTimer = setInterval(function() {
        var now = new Date();
        var currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        var start = state.settings.reminderStart || '07:00';
        var end = state.settings.reminderEnd || '22:00';
        if (currentTime >= start && currentTime <= end) {
            var total = getTotalWater();
            var remaining = state.waterTarget - total;
            if (remaining > 0) {
                sendNotification('Time to Drink Water!', 'You have had ' + total + 'ml. ' + remaining + 'ml more to go!');
                showToast('Reminder: Time to drink water!');
            }
        }
    }, state.settings.reminderInterval * 60 * 1000);
}

function stopAutoReminder() {
    if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
}

// ====== FOOD GUIDE ======
function initFoodGuide() {
    document.querySelectorAll('.guide-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.guide-filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active'); renderFoodGuide();
        });
    });
    document.querySelectorAll('.cat-filter').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.cat-filter').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active'); renderFoodGuide();
        });
    });
    renderFoodGuide();
}

function renderFoodGuide() {
    var statusFilter = document.querySelector('.guide-filter-btn.active').dataset.filter;
    var categoryFilter = document.querySelector('.cat-filter.active').dataset.category;
    var foods = FOOD_DATABASE;
    if (statusFilter !== 'all') foods = foods.filter(function(f) { return f.status === statusFilter; });
    if (categoryFilter !== 'all') foods = foods.filter(function(f) { return f.category === categoryFilter; });
    var order = { avoid: 0, moderate: 1, safe: 2 };
    foods.sort(function(a, b) { return order[a.status] - order[b.status]; });
    var container = document.getElementById('foodGuideList');
    if (foods.length === 0) { container.innerHTML = '<p class="empty-state">No foods found</p>'; return; }
    container.innerHTML = foods.map(function(food) {
        return '<div class="guide-item ' + food.status + '" data-food-id="' + food.id + '">' +
            '<div class="guide-item-info"><div class="guide-item-name">' + food.name + '</div>' +
            '<div class="guide-item-detail">Oxalate: ' + food.oxalate + 'mg - ' + food.category + '</div></div>' +
            '<span class="status-badge ' + food.status + '">' + food.status + '</span></div>';
    }).join('');
    container.querySelectorAll('.guide-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var food = FOOD_DATABASE.find(function(f) { return f.id === parseInt(item.dataset.foodId); });
            if (food) showFoodDetail(food);
        });
    });
}

// ====== RISK ======
function calculateTodayRisk() {
    if (state.foodLog.length === 0) return 0;
    return calculateRiskFromLog(state.foodLog);
}

function calculateRiskFromLog(foodLog) {
    var risk = 0;
    var totals = foodLog.reduce(function(acc, f) {
        return {
            oxalate: acc.oxalate + (f.oxalate * f.servings),
            sodium: acc.sodium + (f.sodium * f.servings),
            protein: acc.protein + (f.protein * f.servings)
        };
    }, { oxalate: 0, sodium: 0, protein: 0 });
    if (totals.oxalate > 100) risk += 40; else if (totals.oxalate > 50) risk += 25; else if (totals.oxalate > 25) risk += 10;
    if (totals.sodium > 3000) risk += 30; else if (totals.sodium > 2300) risk += 20; else if (totals.sodium > 1500) risk += 10;
    var avoidCount = foodLog.filter(function(f) { return f.status === 'avoid'; }).length;
    risk += Math.min(avoidCount * 10, 20);
    if (totals.protein > 80) risk += 10; else if (totals.protein > 56) risk += 5;
    return Math.min(risk, 100);
}

// ====== PROGRESS ======
function initProgress() {
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('clearAllData').addEventListener('click', function() {
        if (confirm('Clear ALL data? Cannot be undone!')) { localStorage.clear(); location.reload(); }
    });
    updateProgress();
}

function updateProgress() {
    var history = JSON.parse(localStorage.getItem('kidneycare_history') || '[]');
    renderWeeklyChart(history);
    updateStatistics(history);
    renderHistory(history);
}

function renderWeeklyChart(history) {
    var container = document.getElementById('weeklyChart');
    var last7 = [];
    for (var i = 6; i >= 0; i--) {
        var date = new Date();
        date.setDate(date.getDate() - i);
        var key = date.toISOString().split('T')[0];
        var dayData = history.find(function(h) { return h.date === key; });
        last7.push({
            day: date.toLocaleDateString('en-IN', { weekday: 'short' }),
            water: i === 0 ? getTotalWater() : (dayData ? dayData.totalWater : 0),
            target: i === 0 ? state.waterTarget : (dayData ? dayData.waterTarget || 3000 : 3000)
        });
    }
    var maxW = Math.max.apply(null, last7.map(function(d) { return Math.max(d.water, d.target); }).concat([1]));
    container.innerHTML = '<div class="weekly-bar-chart">' +
        last7.map(function(d) {
            var h = Math.round((d.water / maxW) * 160);
            var color = d.water >= d.target ? '#4CAF50' : '#2196F3';
            return '<div class="chart-bar-group">' +
                '<div class="chart-value">' + (d.water / 1000).toFixed(1) + 'L</div>' +
                '<div class="chart-bar" style="height:' + h + 'px;background:' + color + '"></div>' +
                '<div class="chart-label">' + d.day + '</div></div>';
        }).join('') + '</div>';
}

function updateStatistics(history) {
    var streak = 0;
    var allDays = history.slice();
    if (getTotalWater() >= state.waterTarget) allDays.push({ totalWater: getTotalWater(), waterTarget: state.waterTarget });
    for (var i = allDays.length - 1; i >= 0; i--) {
        if (allDays[i].totalWater >= (allDays[i].waterTarget || 3000)) streak++;
        else break;
    }
    document.getElementById('streakDays').textContent = streak;
    var waterVals = history.map(function(h) { return h.totalWater; }).filter(function(v) { return v > 0; });
    if (getTotalWater() > 0) waterVals.push(getTotalWater());
    document.getElementById('avgWater').textContent = waterVals.length > 0 ?
        Math.round(waterVals.reduce(function(a, b) { return a + b; }, 0) / waterVals.length) : 0;
    var riskVals = history.map(function(h) { return h.riskScore; }).filter(function(v) { return v !== undefined; });
    if (state.foodLog.length > 0) riskVals.push(calculateTodayRisk());
    if (riskVals.length > 0) {
        var avg = Math.round(riskVals.reduce(function(a, b) { return a + b; }, 0) / riskVals.length);
        document.getElementById('avgRisk').textContent = avg < 30 ? 'Low' : avg < 60 ? 'Med' : 'High';
    }
    document.getElementById('totalDaysTracked').textContent =
        history.length + (getTotalWater() > 0 || state.foodLog.length > 0 ? 1 : 0);
}

function renderHistory(history) {
    var container = document.getElementById('historyList');
    if (history.length === 0) { container.innerHTML = '<p class="empty-state">No history yet</p>'; return; }
    container.innerHTML = history.slice().reverse().slice(0, 30).map(function(h) {
        var date = new Date(h.date);
        var met = h.totalWater >= (h.waterTarget || 3000);
        var risk = (h.riskScore || 0) < 30 ? 'Low' : (h.riskScore || 0) < 60 ? 'Med' : 'High';
        return '<div class="history-item">' +
            '<div><div class="history-date">' +
            date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) +
            '</div><div class="history-details">' + (h.foodCount || 0) + ' foods</div></div>' +
            '<div class="history-stats"><div>' + (met ? 'Met' : 'Not Met') + ' - ' +
            (h.totalWater / 1000).toFixed(1) + 'L</div>' +
            '<div class="history-details">Risk: ' + risk + '</div></div></div>';
    }).join('');
}

function exportData() {
    var history = JSON.parse(localStorage.getItem('kidneycare_history') || '[]');
    var data = JSON.stringify({ date: getTodayKey(), settings: state.settings, today: { waterIntake: state.waterIntake, foodLog: state.foodLog }, history: history }, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'kidneycare_' + getTodayKey() + '.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!');
}

// ====== MODALS ======
function initModals() {
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('foodDetailModal').classList.remove('active');
    });
    document.getElementById('addToLog').addEventListener('click', addFoodToLog);
    document.getElementById('foodDetailModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });
}

// ====== SETTINGS ======
function initSettings() {
    document.getElementById('settingsBtn').addEventListener('click', function() {
        document.getElementById('settingsModal').classList.add('active');
        document.getElementById('stoneType').value = state.settings.stoneType;
        document.getElementById('baseWaterTarget').value = state.baseWaterTarget;
        document.getElementById('userWeight').value = state.settings.weight;
    });
    document.getElementById('closeSettings').addEventListener('click', function() {
        document.getElementById('settingsModal').classList.remove('active');
    });
    document.getElementById('settingsModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });
    document.getElementById('saveSettings').addEventListener('click', function() {
        state.settings.stoneType = document.getElementById('stoneType').value;
        state.baseWaterTarget = parseInt(document.getElementById('baseWaterTarget').value);
        state.settings.baseWaterTarget = state.baseWaterTarget;
        state.settings.weight = parseInt(document.getElementById('userWeight').value);
        adjustWaterTarget(); saveState(); updateAll();
        document.getElementById('settingsModal').classList.remove('active');
        showToast('Settings saved!');
    });
}

// ====== PHOTO ANALYZER ======
function initPhotoAnalyzer() {
    var fileInput = document.getElementById('foodImageInput');
    var analyzeBtn = document.getElementById('analyzeBtn');
    var removeBtn = document.getElementById('removePhoto');
    var addBtn = document.getElementById('addAnalyzedToLog');

    if (!fileInput) { console.log('No file input found'); return; }

    fileInput.addEventListener('change', function() {
        var file = this.files && this.files[0];
        if (!file) { showToast('No file selected'); return; }
        console.log('File selected:', file.name, file.type, file.size);
        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('previewImage').src = e.target.result;
            document.getElementById('photoPreview').style.display = 'block';
            document.getElementById('photoUploadArea').style.display = 'none';
            document.getElementById('analyzeBtn').style.display = 'block';
            document.getElementById('analyzeBtn').style.backgroundColor = '#1565C0';
            document.getElementById('analysisResults').style.display = 'none';
            document.getElementById('addAnalyzedFood').style.display = 'none';
            showToast('Photo ready! Click Analyze button.');
        };
        reader.onerror = function() { showToast('Error reading photo. Try again.'); };
        reader.readAsDataURL(file);
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', function() {
            fileInput.value = '';
            document.getElementById('previewImage').src = '';
            document.getElementById('photoPreview').style.display = 'none';
            document.getElementById('photoUploadArea').style.display = 'block';
            document.getElementById('analyzeBtn').style.display = 'none';
            document.getElementById('analysisResults').style.display = 'none';
            document.getElementById('addAnalyzedFood').style.display = 'none';
            analyzedFoodData = null;
            showToast('Photo removed');
        });
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', function() {
            var file = fileInput.files && fileInput.files[0];
            if (file) analyzeFood(file);
            else showToast('Please select a photo first!');
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', addAnalyzedFoodToLog);
    }
}

async function analyzeFood(file) {
    document.getElementById('analyzingLoader').style.display = 'block';
    document.getElementById('analyzeBtn').style.display = 'none';
    document.getElementById('analysisResults').style.display = 'none';
    document.getElementById('addAnalyzedFood').style.display = 'none';

    try {
        var formData = new FormData();
        formData.append('foodImage', file);

        var response = await fetch('/analyze-food', {
            method: 'POST',
            body: formData
        });

        var data = await response.json();
        console.log('Response:', data);

        if (data.success) {
            analyzedFoodData = data.analysis;
            displayAnalysisResults(data.analysis);
        } else {
            showToast('Error: ' + (data.error || 'Unknown error'));
            document.getElementById('analyzeBtn').style.display = 'block';
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showToast('Failed to analyze. Check connection.');
        document.getElementById('analyzeBtn').style.display = 'block';
    }

    document.getElementById('analyzingLoader').style.display = 'none';
}

function displayAnalysisResults(analysis) {
    var container = document.getElementById('analysisContent');
    var total = analysis.total_analysis;
    var html = '';

    html += '<div class="analysis-overall ' + total.overall_status + '">' +
        '<h4>' + (total.overall_status === 'safe' ? 'SAFE MEAL' : total.overall_status === 'moderate' ? 'EAT IN MODERATION' : 'AVOID THIS MEAL') + '</h4>' +
        '<span class="meal-risk-badge ' + total.meal_risk + '">' + total.meal_risk + ' Risk</span>' +
        '<p style="margin-top:8px;">' + total.summary + '</p></div>';

    html += '<div class="total-water-card">' +
        '<h4>Extra Water Needed After This Meal</h4>' +
        '<div class="total-water-amount">' + total.total_water_needed_ml + ' ml</div>' +
        '<p>' + total.recommendation + '</p></div>';

    html += '<h4 style="margin:16px 0 12px;">Food Analysis:</h4>';

    analysis.foods.forEach(function(food) {
        var oxColor = food.oxalate === 'Very High' || food.oxalate === 'High' ? '#F44336' : food.oxalate === 'Medium' ? '#FF9800' : '#4CAF50';
        html += '<div class="food-analysis-item ' + food.status + '">' +
            '<div class="food-analysis-name">' + food.name + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">Portion: ' + food.quantity + '</div>' +
            '<span class="status-badge ' + food.status + '">' + food.status + '</span>' +
            '<div class="food-analysis-nutrients">' +
            '<div class="analysis-nutrient-badge"><span class="value" style="color:' + oxColor + '">' + food.oxalate_mg + '</span><span class="label">Oxalate mg</span></div>' +
            '<div class="analysis-nutrient-badge"><span class="value">' + food.sodium_mg + '</span><span class="label">Sodium mg</span></div>' +
            '<div class="analysis-nutrient-badge"><span class="value">' + food.calcium_mg + '</span><span class="label">Calcium mg</span></div>' +
            '<div class="analysis-nutrient-badge"><span class="value">' + food.protein_g + '</span><span class="label">Protein g</span></div>' +
            '</div>' +
            '<span class="water-needed-badge">Extra Water: ' + food.water_needed_ml + ' ml</span>' +
            '<div class="food-analysis-reason"><strong>Why:</strong> ' + food.reason + '</div>' +
            '<div class="food-analysis-tip"><strong>Tip:</strong> ' + food.tips + '</div></div>';
    });

    container.innerHTML = html;
    document.getElementById('analysisResults').style.display = 'block';
    document.getElementById('addAnalyzedFood').style.display = 'block';

    var hour = new Date().getHours();
    var meal = document.getElementById('photoMealSelect');
    if (hour < 11) meal.value = 'breakfast';
    else if (hour < 15) meal.value = 'lunch';
    else if (hour < 18) meal.value = 'snack';
    else meal.value = 'dinner';

    document.getElementById('analysisResults').scrollIntoView({ behavior: 'smooth' });
}

function addAnalyzedFoodToLog() {
    if (!analyzedFoodData) return;
    var meal = document.getElementById('photoMealSelect').value;
    analyzedFoodData.foods.forEach(function(food) {
        state.foodLog.push({
            id: Date.now() + Math.random(),
            name: food.name + ' (Photo)',
            status: food.status,
            meal: meal,
            servings: 1,
            oxalate: food.oxalate_mg,
            sodium: food.sodium_mg,
            calcium: food.calcium_mg,
            protein: food.protein_g,
            time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        });
    });
    saveState();
    adjustWaterTarget();
    updateAll();
    showToast('Food added to ' + meal + ' log! Drink ' + analyzedFoodData.total_analysis.total_water_needed_ml + 'ml extra water!');
}

// ====== TOAST ======
function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

// ====== UPDATE ALL ======
function updateAll() {
    updateDashboard();
    renderFoodLog();
    updateNutrientBars();
    updateWaterTracker();
    updateProgress();
}