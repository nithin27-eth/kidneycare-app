// ====== APP STATE ======
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

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', function() {    loadState();
    initTabs();
    initDashboard();
    initFoodSearch();
    initWaterTracker();
    initFoodGuide();
    initProgress();
    initModals();
    initSettings();
    updateAll();
    setDailyTip();
    startAutoReminder();
    checkDayReset();
    setInterval(saveState, 30000);
    initPhotoAnalyzer();
});

// ====== LOCAL STORAGE ======
function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

function loadState() {
    const today = getTodayKey();
    const saved = localStorage.getItem('kidneycare_' + today);
    if (saved) {
        const parsed = JSON.parse(saved);
        state.waterIntake = parsed.waterIntake || [];
        state.foodLog = parsed.foodLog || [];
    }

    const settings = localStorage.getItem('kidneycare_settings');
    if (settings) {
        state.settings = Object.assign({}, state.settings, JSON.parse(settings));
    }

    state.baseWaterTarget = state.settings.baseWaterTarget || 3000;
    state.waterTarget = state.baseWaterTarget;
}

function saveState() {
    const today = getTodayKey();
    localStorage.setItem('kidneycare_' + today, JSON.stringify({
        waterIntake: state.waterIntake,
        foodLog: state.foodLog,
        waterTarget: state.waterTarget,
        date: today
    }));
    localStorage.setItem('kidneycare_settings', JSON.stringify(state.settings));
}

function checkDayReset() {
    const today = getTodayKey();
    const lastDate = localStorage.getItem('kidneycare_lastDate');
    if (lastDate && lastDate !== today) {
        archiveDay(lastDate);
    }
    localStorage.setItem('kidneycare_lastDate', today);
}

function archiveDay(date) {
    const data = localStorage.getItem('kidneycare_' + date);
    if (data) {
        let history = JSON.parse(localStorage.getItem('kidneycare_history') || '[]');
        const parsed = JSON.parse(data);
        history.push({
            date: date,
            totalWater: parsed.waterIntake.reduce((sum, w) => sum + w.amount, 0),
            waterTarget: parsed.waterTarget || 3000,
            foodCount: parsed.foodLog.length,
            foodLog: parsed.foodLog,
            riskScore: calculateRiskFromLog(parsed.foodLog)
        });
        if (history.length > 90) {
            history = history.slice(-90);
        }
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

    const now = new Date();
    document.getElementById('currentDate').textContent =
        now.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
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
    const total = getTotalWater();
    const target = state.waterTarget;
    const percent = Math.min((total / target) * 100, 100);
    const circumference = 565;
    const offset = circumference - (percent / 100) * circumference;

    document.getElementById('waterProgress').style.strokeDashoffset = offset;
    document.getElementById('dashWaterAmount').textContent = total;
    document.getElementById('dashWaterTarget').textContent = target;

    const circle = document.getElementById('waterProgress');
    if (percent >= 100) {
        circle.style.stroke = '#4CAF50';
    } else if (percent >= 60) {
        circle.style.stroke = '#2196F3';
    } else if (percent >= 30) {
        circle.style.stroke = '#FF9800';
    } else {
        circle.style.stroke = '#F44336';
    }
}

function updateRiskMeter() {
    const risk = calculateTodayRisk();
    const riskPercent = Math.min(risk, 100);
    document.getElementById('riskFill').style.left = riskPercent + '%';

    const riskText = document.getElementById('riskText');
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
        riskText.textContent = 'High Risk - Too many high-oxalate or sodium foods!';
        riskText.style.color = '#F44336';
    }
}

function updateDashFoodSummary() {
    const container = document.getElementById('dashFoodSummary');
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
    const alerts = [];
    const totalWater = getTotalWater();
    const now = new Date();
    const hour = now.getHours();

    if (hour >= 12 && totalWater < 1000) {
        alerts.push('You have had less than 1L of water and it is past noon!');
    }
    if (hour >= 18 && totalWater < 2000) {
        alerts.push('Evening already! You need to drink more water today.');
    }

    const totalOxalate = state.foodLog.reduce(function(sum, f) {
        return sum + (f.oxalate * f.servings);
    }, 0);
    if (totalOxalate > 50) {
        alerts.push('High oxalate intake today: ' + totalOxalate.toFixed(0) + 'mg (limit: 50mg). Drink extra water!');
    }

    const totalSodium = state.foodLog.reduce(function(sum, f) {
        return sum + (f.sodium * f.servings);
    }, 0);
    if (totalSodium > 2300) {
        alerts.push('Sodium intake too high: ' + totalSodium.toFixed(0) + 'mg. This increases stone risk!');
    }

    const avoidFoods = state.foodLog.filter(function(f) {
        return f.status === 'avoid';
    });
    if (avoidFoods.length > 0) {
        alerts.push('You ate ' + avoidFoods.length + ' food(s) that should be avoided: ' +
            avoidFoods.map(function(f) { return f.name; }).join(', '));
    }

    const alertsCard = document.getElementById('alertsCard');
    const alertsList = document.getElementById('alertsList');

    if (alerts.length > 0) {
        alertsCard.style.display = 'block';
        alertsList.innerHTML = alerts.map(function(a) {
            return '<div class="alert-item">' + a + '</div>';
        }).join('');
    } else {
        alertsCard.style.display = 'none';
    }
}

function setDailyTip() {
    const dayOfYear = Math.floor(
        (new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
    );
    const tipIndex = dayOfYear % DAILY_TIPS.length;
    document.getElementById('dailyTip').textContent = DAILY_TIPS[tipIndex];
}

// ====== FOOD SEARCH ======
function initFoodSearch() {
    const searchInput = document.getElementById('foodSearch');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        const results = FOOD_DATABASE.filter(function(food) {
            return food.name.toLowerCase().includes(query) ||
                food.category.toLowerCase().includes(query);
        }).slice(0, 15);

        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><span>No foods found. Try a different search.</span></div>';
        } else {
            searchResults.innerHTML = results.map(function(food) {
                const statusText = food.status === 'safe' ? 'Safe' :
                    food.status === 'moderate' ? 'Moderate' : 'Avoid';
                return '<div class="search-result-item" data-food-id="' + food.id + '">' +
                    '<div>' +
                    '<div class="result-name">' + food.name + '</div>' +
                    '<div class="result-category">' + food.category + ' - Oxalate: ' + food.oxalate + 'mg</div>' +
                    '</div>' +
                    '<span class="status-badge ' + food.status + '">' + statusText + '</span>' +
                    '</div>';
            }).join('');
        }

        searchResults.style.display = 'block';
    });

    searchResults.addEventListener('click', function(e) {
        const item = e.target.closest('.search-result-item');
        if (item && item.dataset.foodId) {
            const food = FOOD_DATABASE.find(function(f) {
                return f.id === parseInt(item.dataset.foodId);
            });
            if (food) {
                showFoodDetail(food);
                searchResults.style.display = 'none';
                searchInput.value = '';
            }
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            searchResults.style.display = 'none';
        }
    });

    document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            renderFoodLog(btn.dataset.meal);
        });
    });
}

function showFoodDetail(food) {
    selectedFood = food;
    document.getElementById('modalFoodName').textContent = food.name;

    const statusLabel = food.status === 'safe' ? 'SAFE TO EAT' :
        food.status === 'moderate' ? 'EAT IN MODERATION' : 'AVOID';

    let alternativesHTML = '';
    if (food.alternatives && food.alternatives.length > 0) {
        alternativesHTML = '<div class="food-detail-alternatives">' +
            '<h4>Better Alternatives:</h4>' +
            food.alternatives.map(function(a) {
                return '<span class="alt-tag">' + a + '</span>';
            }).join('') +
            '</div>';
    }

    const oxColor = food.oxalate > 50 ? '#F44336' :
        food.oxalate > 20 ? '#FF9800' : '#4CAF50';
    const naColor = food.sodium > 400 ? '#F44336' :
        food.sodium > 200 ? '#FF9800' : '#4CAF50';

    document.getElementById('modalBody').innerHTML =
        '<div class="food-detail-status ' + food.status + '">' + statusLabel + '</div>' +
        '<div class="food-detail-reason"><strong>Why:</strong> ' + food.reason + '</div>' +
        '<div class="food-detail-nutrients">' +
        '<div class="nutrient-badge">' +
        '<span class="value" style="color:' + oxColor + '">' + food.oxalate + '</span>' +
        '<span class="label">Oxalate (mg)</span>' +
        '</div>' +
        '<div class="nutrient-badge">' +
        '<span class="value" style="color:' + naColor + '">' + food.sodium + '</span>' +
        '<span class="label">Sodium (mg)</span>' +
        '</div>' +
        '<div class="nutrient-badge">' +
        '<span class="value">' + food.calcium + '</span>' +
        '<span class="label">Calcium (mg)</span>' +
        '</div>' +
        '<div class="nutrient-badge">' +
        '<span class="value">' + food.protein + '</span>' +
        '<span class="label">Protein (g)</span>' +
        '</div>' +
        '</div>' +
        '<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;">Per serving: ' + food.serving + '</p>' +
        '<div class="food-detail-tips"><strong>Tip:</strong> ' + food.tips + '</div>' +
        alternativesHTML;

    const hour = new Date().getHours();
    const mealSelect = document.getElementById('mealSelect');
    if (hour < 11) {
        mealSelect.value = 'breakfast';
    } else if (hour < 15) {
        mealSelect.value = 'lunch';
    } else if (hour < 18) {
        mealSelect.value = 'snack';
    } else {
        mealSelect.value = 'dinner';
    }

    document.getElementById('servingAmount').value = 1;
    document.getElementById('foodDetailModal').classList.add('active');
}

function addFoodToLog() {
    if (!selectedFood) return;

    const meal = document.getElementById('mealSelect').value;
    const servings = parseFloat(document.getElementById('servingAmount').value) || 1;

    const entry = {
        id: Date.now(),
        foodId: selectedFood.id,
        name: selectedFood.name,
        status: selectedFood.status,
        meal: meal,
        servings: servings,
        oxalate: selectedFood.oxalate,
        sodium: selectedFood.sodium,
        calcium: selectedFood.calcium,
        protein: selectedFood.protein,
        time: new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        })
    };

    state.foodLog.push(entry);
    saveState();
    adjustWaterTarget();
    updateAll();

    document.getElementById('foodDetailModal').classList.remove('active');

    const statusEmoji = entry.status === 'avoid' ? 'Warning' :
        entry.status === 'moderate' ? 'Caution' : 'Good';
    showToast(statusEmoji + ': ' + entry.name + ' added to ' + meal);

    if (entry.status === 'avoid') {
        setTimeout(function() {
            showToast('This food is not recommended! Drink extra water to compensate.');
        }, 2000);
    }
}

function removeFoodFromLog(entryId) {
    state.foodLog = state.foodLog.filter(function(f) {
        return f.id !== entryId;
    });
    saveState();
    adjustWaterTarget();
    updateAll();
    showToast('Food entry removed');
}

function renderFoodLog(filter) {
    if (!filter) filter = 'all';
    const container = document.getElementById('foodLogList');
    let entries = state.foodLog;

    if (filter !== 'all') {
        entries = entries.filter(function(f) {
            return f.meal === filter;
        });
    }

    if (entries.length === 0) {
        container.innerHTML = '<p class="empty-state">No food logged yet' +
            (filter !== 'all' ? ' for ' + filter : '') + '</p>';
        return;
    }

    container.innerHTML = entries.map(function(entry) {
        return '<div class="food-log-entry ' + entry.status + '">' +
            '<div class="log-entry-info">' +
            '<div class="log-entry-name">' + entry.name + '</div>' +
            '<div class="log-entry-details">' +
            entry.servings + 'x serving - Oxalate: ' +
            (entry.oxalate * entry.servings).toFixed(0) + 'mg - ' +
            'Sodium: ' + (entry.sodium * entry.servings).toFixed(0) + 'mg' +
            '</div>' +
            '<div class="log-entry-time">' + entry.time + ' - ' + entry.meal + '</div>' +
            '</div>' +
            '<button class="log-entry-delete" onclick="removeFoodFromLog(' + entry.id + ')">X</button>' +
            '</div>';
    }).join('');
}

function updateNutrientBars() {
    const totals = state.foodLog.reduce(function(acc, f) {
        return {
            oxalate: acc.oxalate + (f.oxalate * f.servings),
            sodium: acc.sodium + (f.sodium * f.servings),
            calcium: acc.calcium + (f.calcium * f.servings),
            protein: acc.protein + (f.protein * f.servings)
        };
    }, { oxalate: 0, sodium: 0, calcium: 0, protein: 0 });

    const oxPercent = Math.min((totals.oxalate / 50) * 100, 100);
    document.getElementById('oxalateFill').style.width = oxPercent + '%';
    document.getElementById('oxalateValue').textContent = totals.oxalate.toFixed(0) + ' mg';

    const naPercent = Math.min((totals.sodium / 2300) * 100, 100);
    document.getElementById('sodiumFill').style.width = naPercent + '%';
    document.getElementById('sodiumValue').textContent = totals.sodium.toFixed(0) + ' mg';

    const caPercent = Math.min((totals.calcium / 1000) * 100, 100);
    document.getElementById('calciumFill').style.width = caPercent + '%';
    document.getElementById('calciumValue').textContent = totals.calcium.toFixed(0) + ' mg';

    const prPercent = Math.min((totals.protein / 56) * 100, 100);
    document.getElementById('proteinFill').style.width = prPercent + '%';
    document.getElementById('proteinValue').textContent = totals.protein.toFixed(0) + ' g';
}

// ====== WATER TARGET ======
function adjustWaterTarget() {
    let target = state.baseWaterTarget;
    const reasons = [];

    const totals = state.foodLog.reduce(function(acc, f) {
        return {
            oxalate: acc.oxalate + (f.oxalate * f.servings),
            sodium: acc.sodium + (f.sodium * f.servings)
        };
    }, { oxalate: 0, sodium: 0 });

    if (totals.oxalate > 50) {
        const extra = Math.min(Math.floor((totals.oxalate - 50) / 25) * 250, 1000);
        target += extra;
        reasons.push('+' + extra + 'ml for high oxalate');
    }

    if (totals.sodium > 1500) {
        const extra = Math.min(Math.floor((totals.sodium - 1500) / 500) * 250, 750);
        target += extra;
        reasons.push('+' + extra + 'ml for high sodium');
    }

    const avoidCount = state.foodLog.filter(function(f) {
        return f.status === 'avoid';
    }).length;

    if (avoidCount > 0) {
        const extra = avoidCount * 250;
        target += extra;
        reasons.push('+' + extra + 'ml for ' + avoidCount + ' high-risk food(s)');
    }

    state.waterTarget = target;

    const note = document.getElementById('waterAdjustedNote');
    if (reasons.length > 0) {
        note.textContent = 'Target adjusted: ' + reasons.join(', ');
    } else {
        note.textContent = '';
    }

    document.getElementById('waterTargetDisplay').textContent = target + ' ml';
    document.getElementById('dashWaterTarget').textContent = target;

    saveState();
}

// ====== WATER TRACKER ======
function initWaterTracker() {
    document.querySelectorAll('.btn-water').forEach(function(btn) {
        btn.addEventListener('click', function() {
            addWater(parseInt(btn.dataset.amount));
        });
    });

    document.getElementById('addCustomWater').addEventListener('click', function() {
        const input = document.getElementById('customWaterAmount');
        const amount = parseInt(input.value);
        if (amount > 0) {
            addWater(amount);
            input.value = '';
        }
    });

    document.getElementById('customWaterAmount').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('addCustomWater').click();
        }
    });

    document.getElementById('undoWater').addEventListener('click', function() {
        if (state.waterIntake.length > 0) {
            const removed = state.waterIntake.pop();
            saveState();
            updateAll();
            showToast('Removed ' + removed.amount + 'ml');
        }
    });

    document.getElementById('enableReminders').addEventListener('change', function(e) {
        state.settings.reminderEnabled = e.target.checked;
        saveState();
        if (e.target.checked) {
            requestNotificationPermission();
            startAutoReminder();
            showToast('Water reminders enabled!');
        } else {
            stopAutoReminder();
            showToast('Water reminders disabled');
        }
    });

    document.getElementById('reminderInterval').addEventListener('change', function(e) {
        state.settings.reminderInterval = parseInt(e.target.value);
        saveState();
        if (state.settings.reminderEnabled) {
            stopAutoReminder();
            startAutoReminder();
        }
    });

    document.getElementById('enableReminders').checked = state.settings.reminderEnabled;
    document.getElementById('reminderInterval').value = state.settings.reminderInterval;
    document.getElementById('reminderStart').value = state.settings.reminderStart || '07:00';
    document.getElementById('reminderEnd').value = state.settings.reminderEnd || '22:00';
}

function addWater(amount) {
    state.waterIntake.push({
        amount: amount,
        time: new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        }),
        timestamp: Date.now()
    });
    saveState();
    updateAll();

    const total = getTotalWater();
    if (total >= state.waterTarget) {
        showToast('You have reached your water target! Keep going!');
    } else {
        showToast('+' + amount + 'ml added! Total: ' + total + 'ml');
    }
}

function getTotalWater() {
    return state.waterIntake.reduce(function(sum, w) {
        return sum + w.amount;
    }, 0);
}

function updateWaterTracker() {
    const total = getTotalWater();
    const target = state.waterTarget;
    const percent = Math.min((total / target) * 100, 100);

    document.getElementById('waterTotal').textContent = total + ' ml';
    document.getElementById('waterTargetDisplay').textContent = target + ' ml';
    document.getElementById('bottleFill').style.height = percent + '%';

    const logContainer = document.getElementById('waterLog');
    if (state.waterIntake.length === 0) {
        logContainer.innerHTML = '<p class="empty-state">No water logged yet</p>';
    } else {
        const reversed = state.waterIntake.slice().reverse();
        logContainer.innerHTML = reversed.map(function(w) {
            return '<div class="water-log-item">' +
                '<span>' + w.amount + ' ml</span>' +
                '<span>' + w.time + '</span>' +
                '</div>';
        }).join('');
    }
}

// ====== NOTIFICATIONS ======
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body });
    }
}

function startAutoReminder() {
    if (!state.settings.reminderEnabled) return;
    stopAutoReminder();

    const intervalMs = state.settings.reminderInterval * 60 * 1000;

    reminderTimer = setInterval(function() {
        const now = new Date();
        const currentTime = String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');
        const start = state.settings.reminderStart || '07:00';
        const end = state.settings.reminderEnd || '22:00';

        if (currentTime >= start && currentTime <= end) {
            const total = getTotalWater();
            const remaining = state.waterTarget - total;

            if (remaining > 0) {
                sendNotification(
                    'Time to Drink Water!',
                    'You have had ' + total + 'ml today. ' +
                    remaining + 'ml more to reach your goal!'
                );
                showToast('Reminder: Time to drink water!');
            }
        }
    }, intervalMs);
}

function stopAutoReminder() {
    if (reminderTimer) {
        clearInterval(reminderTimer);
        reminderTimer = null;
    }
}

// ====== FOOD GUIDE ======
function initFoodGuide() {
    document.querySelectorAll('.guide-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.guide-filter-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            renderFoodGuide();
        });
    });

    document.querySelectorAll('.cat-filter').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.cat-filter').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            renderFoodGuide();
        });
    });

    renderFoodGuide();
}

function renderFoodGuide() {
    const statusFilter = document.querySelector('.guide-filter-btn.active').dataset.filter;
    const categoryFilter = document.querySelector('.cat-filter.active').dataset.category;

    let foods = FOOD_DATABASE;

    if (statusFilter !== 'all') {
        foods = foods.filter(function(f) {
            return f.status === statusFilter;
        });
    }

    if (categoryFilter !== 'all') {
        foods = foods.filter(function(f) {
            return f.category === categoryFilter;
        });
    }

    const statusOrder = { avoid: 0, moderate: 1, safe: 2 };
    foods.sort(function(a, b) {
        return statusOrder[a.status] - statusOrder[b.status];
    });

    const container = document.getElementById('foodGuideList');

    if (foods.length === 0) {
        container.innerHTML = '<p class="empty-state">No foods found for this filter</p>';
        return;
    }

    container.innerHTML = foods.map(function(food) {
        const statusIcon = food.status === 'safe' ? 'SAFE' :
            food.status === 'moderate' ? 'MODERATE' : 'AVOID';
        return '<div class="guide-item ' + food.status + '" data-food-id="' + food.id + '">' +
            '<div class="guide-item-info">' +
            '<div class="guide-item-name">' + food.name + '</div>' +
            '<div class="guide-item-detail">' +
            'Oxalate: ' + food.oxalate + 'mg - ' + food.category + ' - ' + food.serving +
            '</div>' +
            '</div>' +
            '<span class="status-badge ' + food.status + '">' + statusIcon + '</span>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.guide-item').forEach(function(item) {
        item.addEventListener('click', function() {
            const food = FOOD_DATABASE.find(function(f) {
                return f.id === parseInt(item.dataset.foodId);
            });
            if (food) showFoodDetail(food);
        });
    });
}

// ====== RISK CALCULATION ======
function calculateTodayRisk() {
    if (state.foodLog.length === 0) return 0;
    return calculateRiskFromLog(state.foodLog);
}

function calculateRiskFromLog(foodLog) {
    let risk = 0;

    const totals = foodLog.reduce(function(acc, f) {
        return {
            oxalate: acc.oxalate + (f.oxalate * f.servings),
            sodium: acc.sodium + (f.sodium * f.servings),
            protein: acc.protein + (f.protein * f.servings)
        };
    }, { oxalate: 0, sodium: 0, protein: 0 });

    if (totals.oxalate > 100) risk += 40;
    else if (totals.oxalate > 50) risk += 25;
    else if (totals.oxalate > 25) risk += 10;

    if (totals.sodium > 3000) risk += 30;
    else if (totals.sodium > 2300) risk += 20;
    else if (totals.sodium > 1500) risk += 10;

    const avoidCount = foodLog.filter(function(f) {
        return f.status === 'avoid';
    }).length;
    risk += Math.min(avoidCount * 10, 20);

    if (totals.protein > 80) risk += 10;
    else if (totals.protein > 56) risk += 5;

    return Math.min(risk, 100);
}

// ====== PROGRESS ======
function initProgress() {
    document.getElementById('exportData').addEventListener('click', exportData);

    document.getElementById('clearAllData').addEventListener('click', function() {
        if (confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
            localStorage.clear();
            location.reload();
        }
    });

    updateProgress();
}

function updateProgress() {
    const history = JSON.parse(localStorage.getItem('kidneycare_history') || '[]');
    renderWeeklyChart(history);
    updateStatistics(history);
    renderHistory(history);
}

function renderWeeklyChart(history) {
    const container = document.getElementById('weeklyChart');
    const last7Days = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().split('T')[0];
        const dayData = history.find(function(h) { return h.date === key; });

        let water = 0;
        let target = 3000;

        if (i === 0) {
            water = getTotalWater();
            target = state.waterTarget;
        } else if (dayData) {
            water = dayData.totalWater;
            target = dayData.waterTarget || 3000;
        }

        last7Days.push({
            day: date.toLocaleDateString('en-IN', { weekday: 'short' }),
            water: water,
            target: target
        });
    }

    const maxWater = Math.max.apply(null,
        last7Days.map(function(d) { return Math.max(d.water, d.target); }).concat([1])
    );

    container.innerHTML = '<div class="weekly-bar-chart">' +
        last7Days.map(function(d) {
            const waterHeight = Math.round((d.water / maxWater) * 160);
            const met = d.water >= d.target;
            const color = met ? '#4CAF50' : '#2196F3';
            return '<div class="chart-bar-group">' +
                '<div class="chart-value">' + (d.water / 1000).toFixed(1) + 'L</div>' +
                '<div class="chart-bar" style="height:' + waterHeight + 'px;background:' + color + '"></div>' +
                '<div class="chart-label">' + d.day + '</div>' +
                '</div>';
        }).join('') +
        '</div>';
}

function updateStatistics(history) {
    let streak = 0;
    const allDays = history.slice();

    if (getTotalWater() >= state.waterTarget) {
        allDays.push({
            date: getTodayKey(),
            totalWater: getTotalWater(),
            waterTarget: state.waterTarget
        });
    }

    for (let i = allDays.length - 1; i >= 0; i--) {
        if (allDays[i].totalWater >= (allDays[i].waterTarget || 3000)) {
            streak++;
        } else {
            break;
        }
    }

    document.getElementById('streakDays').textContent = streak;

    const waterValues = history.map(function(h) { return h.totalWater; })
        .filter(function(v) { return v > 0; });
    if (getTotalWater() > 0) waterValues.push(getTotalWater());

    const avgWater = waterValues.length > 0 ?
        Math.round(waterValues.reduce(function(a, b) { return a + b; }, 0) / waterValues.length) : 0;
    document.getElementById('avgWater').textContent = avgWater;

    const riskValues = history.map(function(h) { return h.riskScore; })
        .filter(function(v) { return v !== undefined; });
    if (state.foodLog.length > 0) riskValues.push(calculateTodayRisk());

    if (riskValues.length > 0) {
        const avgRisk = Math.round(
            riskValues.reduce(function(a, b) { return a + b; }, 0) / riskValues.length
        );
        document.getElementById('avgRisk').textContent =
            avgRisk < 30 ? 'Low' : avgRisk < 60 ? 'Med' : 'High';
    }

    const tracked = history.length +
        (getTotalWater() > 0 || state.foodLog.length > 0 ? 1 : 0);
    document.getElementById('totalDaysTracked').textContent = tracked;
}

function renderHistory(history) {
    const container = document.getElementById('historyList');
    if (history.length === 0) {
        container.innerHTML = '<p class="empty-state">No history yet. Keep tracking daily!</p>';
        return;
    }

    container.innerHTML = history.slice().reverse().slice(0, 30).map(function(h) {
        const date = new Date(h.date);
        const waterMet = h.totalWater >= (h.waterTarget || 3000);
        const riskScore = h.riskScore || 0;
        const riskLabel = riskScore < 30 ? 'Low' : riskScore < 60 ? 'Med' : 'High';

        return '<div class="history-item">' +
            '<div>' +
            '<div class="history-date">' +
            date.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            }) +
            '</div>' +
            '<div class="history-details">' + (h.foodCount || 0) + ' foods logged</div>' +
            '</div>' +
            '<div class="history-stats">' +
            '<div>' + (waterMet ? 'Met' : 'Not Met') + ' - ' +
            (h.totalWater / 1000).toFixed(1) + 'L / ' +
            ((h.waterTarget || 3000) / 1000).toFixed(1) + 'L</div>' +
            '<div class="history-details">Risk: ' + riskLabel + '</div>' +
            '</div>' +
            '</div>';
    }).join('');
}

function exportData() {
    const history = JSON.parse(localStorage.getItem('kidneycare_history') || '[]');
    const exportObj = {
        exportDate: new Date().toISOString(),
        settings: state.settings,
        today: {
            date: getTodayKey(),
            waterIntake: state.waterIntake,
            foodLog: state.foodLog,
            totalWater: getTotalWater(),
            waterTarget: state.waterTarget
        },
        history: history
    };

    const blob = new Blob(
        [JSON.stringify(exportObj, null, 2)],
        { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kidneycare_backup_' + getTodayKey() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!');
}

// ====== MODALS ======
function initModals() {
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('foodDetailModal').classList.remove('active');
    });

    document.getElementById('addToLog').addEventListener('click', addFoodToLog);

    document.getElementById('foodDetailModal').addEventListener('click', function(e) {
        if (e.target === document.getElementById('foodDetailModal')) {
            document.getElementById('foodDetailModal').classList.remove('active');
        }
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
        if (e.target === document.getElementById('settingsModal')) {
            document.getElementById('settingsModal').classList.remove('active');
        }
    });

    document.getElementById('saveSettings').addEventListener('click', function() {
        state.settings.stoneType = document.getElementById('stoneType').value;
        state.baseWaterTarget = parseInt(document.getElementById('baseWaterTarget').value);
        state.settings.baseWaterTarget = state.baseWaterTarget;
        state.settings.weight = parseInt(document.getElementById('userWeight').value);

        adjustWaterTarget();
        saveState();
        updateAll();

        document.getElementById('settingsModal').classList.remove('active');
        showToast('Settings saved!');
    });
}

// ====== TOAST ======
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

// ====== UPDATE ALL ======
function updateAll() {
    updateDashboard();
    renderFoodLog();
    updateNutrientBars();
    updateWaterTracker();
    updateProgress();
}
// ====== PHOTO ANALYZER ======
let analyzedFoodData = null;

function initPhotoAnalyzer() {
    const uploadBtn = document.getElementById('uploadPhotoBtn');
    const fileInput = document.getElementById('foodImageInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const removePhoto = document.getElementById('removePhoto');
    const photoUploadArea = document.getElementById('photoUploadArea');

    // Click upload button
    uploadBtn.addEventListener('click', function() {
        fileInput.click();
    });

    // Click upload area
    photoUploadArea.addEventListener('click', function() {
        fileInput.click();
    });

    // File selected
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('previewImage').src = e.target.result;
                document.getElementById('photoPreview').style.display = 'block';
                document.getElementById('photoUploadArea').style.display = 'none';
                document.getElementById('analyzeBtn').style.display = 'block';
                document.getElementById('analysisResults').style.display = 'none';
                document.getElementById('addAnalyzedFood').style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    // Remove photo
    removePhoto.addEventListener('click', function() {
        fileInput.value = '';
        document.getElementById('previewImage').src = '';
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('photoUploadArea').style.display = 'block';
        document.getElementById('analyzeBtn').style.display = 'none';
        document.getElementById('analysisResults').style.display = 'none';
        document.getElementById('addAnalyzedFood').style.display = 'none';
        analyzedFoodData = null;
    });

    // Analyze button
    analyzeBtn.addEventListener('click', function() {
        const file = fileInput.files[0];
        if (file) {
            analyzeFood(file);
        }
    });

    // Add to log button
    document.getElementById('addAnalyzedToLog').addEventListener('click', function() {
        addAnalyzedFoodToLog();
    });
}

async function analyzeFood(file) {
    // Show loader
    document.getElementById('analyzingLoader').style.display = 'block';
    document.getElementById('analyzeBtn').style.display = 'none';
    document.getElementById('analysisResults').style.display = 'none';
    document.getElementById('addAnalyzedFood').style.display = 'none';

    try {
        // Create form data
        const formData = new FormData();
        formData.append('foodImage', file);

        // Send to server
        const response = await fetch('/analyze-food', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            analyzedFoodData = data.analysis;
            displayAnalysisResults(data.analysis);
        } else {
            showToast('Error: ' + data.error);
            document.getElementById('analyzeBtn').style.display = 'block';
        }

    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to analyze food. Please try again.');
        document.getElementById('analyzeBtn').style.display = 'block';
    }

    // Hide loader
    document.getElementById('analyzingLoader').style.display = 'none';
}

function displayAnalysisResults(analysis) {
    const container = document.getElementById('analysisContent');
    const total = analysis.total_analysis;

    // Overall status icon
    const statusIcon = total.overall_status === 'safe' ? 'SAFE MEAL' :
        total.overall_status === 'moderate' ? 'EAT IN MODERATION' : 'AVOID THIS MEAL';

    // Risk badge
    const riskColor = total.meal_risk === 'Low' ? 'safe' :
        total.meal_risk === 'Medium' ? 'moderate' : 'avoid';

    let html = '';

    // Overall Analysis Card
    html += '<div class="analysis-overall ' + total.overall_status + '">' +
        '<h4>' + statusIcon + '</h4>' +
        '<span class="meal-risk-badge ' + total.meal_risk + '">' +
        total.meal_risk + ' Risk</span>' +
        '<p>' + total.summary + '</p>' +
        '</div>';

    // Total Water Needed
    html += '<div class="total-water-card">' +
        '<h4>Extra Water Needed After This Meal</h4>' +
        '<div class="total-water-amount">' + total.total_water_needed_ml + ' ml</div>' +
        '<p>' + total.recommendation + '</p>' +
        '</div>';

    // Individual Foods
    html += '<h4 style="margin: 16px 0 12px;">Individual Food Analysis:</h4>';

    analysis.foods.forEach(function(food) {
        const oxColor = food.oxalate === 'Very High' || food.oxalate === 'High' ?
            '#F44336' : food.oxalate === 'Medium' ? '#FF9800' : '#4CAF50';

        html += '<div class="food-analysis-item ' + food.status + '">' +

            // Food name and quantity
            '<div class="food-analysis-name">' + food.name + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">' +
            'Portion: ' + food.quantity + '</div>' +

            // Status badge
            '<span class="status-badge ' + food.status + '">' +
            (food.status === 'safe' ? 'SAFE' :
            food.status === 'moderate' ? 'MODERATE' : 'AVOID') +
            '</span>' +

            // Nutrients
            '<div class="food-analysis-nutrients">' +
            '<div class="analysis-nutrient-badge">' +
            '<span class="value" style="color:' + oxColor + '">' +
            food.oxalate_mg + '</span>' +
            '<span class="label">Oxalate (mg)</span>' +
            '</div>' +
            '<div class="analysis-nutrient-badge">' +
            '<span class="value">' + food.sodium_mg + '</span>' +
            '<span class="label">Sodium (mg)</span>' +
            '</div>' +
            '<div class="analysis-nutrient-badge">' +
            '<span class="value">' + food.calcium_mg + '</span>' +
            '<span class="label">Calcium (mg)</span>' +
            '</div>' +
            '<div class="analysis-nutrient-badge">' +
            '<span class="value">' + food.protein_g + '</span>' +
            '<span class="label">Protein (g)</span>' +
            '</div>' +
            '</div>' +

            // Oxalate level
            '<div style="margin:8px 0;">' +
            '<strong>Oxalate Level:</strong> ' +
            '<span style="color:' + oxColor + ';font-weight:600;">' +
            food.oxalate + '</span>' +
            '</div>' +

            // Water needed
            '<span class="water-needed-badge">' +
            'Extra Water Needed: ' + food.water_needed_ml + ' ml' +
            '</span>' +

            // Reason
            '<div class="food-analysis-reason">' +
            '<strong>Why:</strong> ' + food.reason +
            '</div>' +

            // Tips
            '<div class="food-analysis-tip">' +
            '<strong>Tip:</strong> ' + food.tips +
            '</div>' +

            '</div>';
    });

    container.innerHTML = html;

    // Show results and add to log button
    document.getElementById('analysisResults').style.display = 'block';
    document.getElementById('addAnalyzedFood').style.display = 'block';

    // Auto set meal time
    const hour = new Date().getHours();
    const mealSelect = document.getElementById('photoMealSelect');
    if (hour < 11) mealSelect.value = 'breakfast';
    else if (hour < 15) mealSelect.value = 'lunch';
    else if (hour < 18) mealSelect.value = 'snack';
    else mealSelect.value = 'dinner';

    // Scroll to results
    document.getElementById('analysisResults').scrollIntoView({
        behavior: 'smooth'
    });
}

function addAnalyzedFoodToLog() {
    if (!analyzedFoodData) return;

    const meal = document.getElementById('photoMealSelect').value;
    const total = analyzedFoodData.total_analysis;

    // Add each food to log
    analyzedFoodData.foods.forEach(function(food) {
        const entry = {
            id: Date.now() + Math.random(),
            name: food.name + ' (Photo)',
            status: food.status,
            meal: meal,
            servings: 1,
            oxalate: food.oxalate_mg,
            sodium: food.sodium_mg,
            calcium: food.calcium_mg,
            protein: food.protein_g,
            time: new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit'
            })
        };
        state.foodLog.push(entry);
    });

    // Add extra water needed
    if (total.total_water_needed_ml > 0) {
        showToast('Added to log! Drink ' +
            total.total_water_needed_ml +
            'ml extra water for this meal!');
    }

    saveState();
    adjustWaterTarget();
    updateAll();

    showToast('Food added to ' + meal + ' log!');
}