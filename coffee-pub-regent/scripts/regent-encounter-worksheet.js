/**
 * Encounter worksheet globals for Regent.
 * Application V2 injects body HTML without executing <script> in partials, so inline
 * onclick handlers (e.g. incrementLevelCount, removeCard) would see undefined.
 * This module runs at load and assigns all encounter worksheet functions to window
 * so those handlers work. Uses window.addTokensToContainer (set from window-query.js).
 */

// ********************************************************
// ********** NPC FUNCTIONS ***********************
// ********************************************************

function updateTotalNPCCR(id, npcTokens = null) {
    let totalCR = 0;
    if (npcTokens) {
        npcTokens.forEach(token => {
            if (token.actor.type === 'npc' && token.document.disposition >= 0) {
                const crValue = parseFloat(token.actor.system.details.cr);
                if (!isNaN(crValue)) totalCR += crValue;
                else console.error('CR value not found or invalid', token);
            }
        });
    } else {
        const npcElements = document.querySelectorAll(`#workspace-section-npcs-content-${id} .player-card[data-type="npc"]`);
        npcElements.forEach(element => {
            const crValue = parseFloat(element.getAttribute('data-cr'));
            if (!isNaN(crValue)) totalCR += crValue;
            else console.error('CR value not found or invalid', element);
        });
    }
    let formattedTotalNPCCRValue = totalCR;
    if (totalCR > 0 && totalCR < 0.125) formattedTotalNPCCRValue = 0.125;
    const partyCRElement = document.querySelector(`#npcPartyCRValue-${id}`);
    const partyCRValue = parseFloat(partyCRElement?.innerText) || 0;
    const heroCRValue = partyCRValue + formattedTotalNPCCRValue;
    const npcNPCCR = document.getElementById(`npcNPCCRValue-${id}`);
    const npcHeroCR = document.getElementById(`npcHeroCRValue-${id}`);
    const badgeHeroCR = document.getElementById(`badgeHeroCRValue-${id}`);
    if (npcNPCCR) npcNPCCR.innerText = formattedTotalNPCCRValue.toFixed(2);
    if (npcHeroCR) npcHeroCR.innerText = heroCRValue.toFixed(2);
    if (badgeHeroCR) badgeHeroCR.innerText = heroCRValue.toFixed(2);
}

function addNPCDropZoneHandlers(id) {
    const dropZone = document.getElementById(`npcs-drop-zone-${id}`);
    if (!dropZone) return;
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('dragover');
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (!data) return;
        const token = await fromUuid(data.uuid);
        if (!token) return;
        if (token.actor?.type !== 'npc' || token.document.disposition < 0) {
            ui.notifications.warn("Only non-hostile NPCs can be added to the NPC worksheet.");
            return;
        }
        const container = document.querySelector(`#workspace-section-npcs-content-${id} .npc-container`);
        if (container) {
            const message = container.querySelector('.message-box');
            if (message) message.style.display = 'none';
            const tokens = [{ actor: token.actor, document: token.document }];
            if (typeof window.addTokensToContainer === 'function') {
                await window.addTokensToContainer(id, 'npc', tokens);
            }
            updateTotalNPCCR(id);
            window.updateAllCounts(id);
        }
    });
}

// ********************************************************
// ********** MONSTER FUNCTIONS ***********************
// ********************************************************

function updateTotalMonsterCR(id, monsterTokens = null) {
    const monstersContainer = document.querySelector(`#workspace-section-monsters-content-${id}`);
    if (!monstersContainer) return;
    let totalCR = 0;
    if (monsterTokens) {
        monsterTokens.forEach(monster => {
            if (monster.actor?.system?.details?.type === 'NPC') return;
            const crValue = parseFloat(monster.actor?.system?.details?.cr);
            if (!isNaN(crValue)) totalCR += crValue;
            else console.error('CR value not found or invalid', monster);
        });
    } else {
        monstersContainer.querySelectorAll('.player-card').forEach(element => {
            if (element.getAttribute('data-type') === 'NPC') return;
            const crValue = parseFloat(element.getAttribute('data-cr'));
            if (!isNaN(crValue)) totalCR += crValue;
            else console.error('CR value not found or invalid', element);
        });
    }
    const crValueElement = document.getElementById(`monsterCRValue-${id}`);
    if (crValueElement) crValueElement.innerText = totalCR.toFixed(2);
}

function updateGapCRValue(id) {
    const targetEl = document.getElementById(`targetCRValue-${id}`);
    const monsterEl = document.getElementById(`monsterCRValue-${id}`);
    if (!targetEl || !monsterEl) return;
    const targetCRValue = parseFloat(targetEl.innerText);
    const monsterCRValue = parseFloat(monsterEl.innerText);
    const gapCRValue = targetCRValue - monsterCRValue;
    const gapWorksheetElement = document.getElementById(`gapCRValue-${id}`);
    const gapBadgeElement = document.getElementById(`gapBadgeCRValue-${id}`);
    if (gapWorksheetElement) gapWorksheetElement.innerText = Math.abs(gapCRValue).toFixed(2);
    if (gapBadgeElement) gapBadgeElement.innerText = Math.abs(gapCRValue).toFixed(2);
    const gapWorksheetContainer = gapWorksheetElement?.parentElement;
    const gapBadgeContainer = gapBadgeElement?.parentElement;
    if (gapWorksheetContainer) gapWorksheetContainer.classList.remove('gap-lessthan', 'gap-greaterthan', 'gap-equalto');
    if (gapBadgeContainer) gapBadgeContainer.classList.remove('gap-lessthan', 'gap-greaterthan', 'gap-equalto');
    const percentageDifference = targetCRValue ? Math.abs(gapCRValue) / targetCRValue : 0;
    if (percentageDifference <= 0.10) {
        gapWorksheetContainer?.classList.add('gap-equalto');
        gapBadgeContainer?.classList.add('gap-equalto');
    } else if (gapCRValue < 0) {
        gapWorksheetContainer?.classList.add('gap-lessthan');
        gapBadgeContainer?.classList.add('gap-lessthan');
    } else {
        gapWorksheetContainer?.classList.add('gap-greaterthan');
        gapBadgeContainer?.classList.add('gap-greaterthan');
    }
}

// ********************************************************
// ********** CHARACTER FUNCTIONS *************************
// ********************************************************

function updateTotalPlayerCounts(id, characterTokens = null) {
    let partyCardTier0Adjustment = 0, partyCardTier1Adjustment = 0, partyCardTier2Adjustment = 0, partyCardTier3Adjustment = 0;
    let partyButtonTier0Adjustment = 0, partyButtonTier1Adjustment = 0, partyButtonTier2Adjustment = 0, partyButtonTier3Adjustment = 0;
    let totalButtonTier0Adjustment = 0, totalButtonTier1Adjustment = 0, totalButtonTier2Adjustment = 0, totalButtonTier3Adjustment = 0;
    let totalCardLevel1to4 = 0, totalCardLevel5to10 = 0, totalCardLevel11to16 = 0, totalCardLevel17to20 = 0;
    let totalButtonLevel1to4 = 0, totalButtonLevel5to10 = 0, totalButtonLevel11to16 = 0, totalButtonLevel17to20 = 0;
    let totalLevel1to4 = 0, totalLevel5to10 = 0, totalLevel11to16 = 0, totalLevel17to20 = 0;
    let partyLevel = 0;
    let partyAdjustment = 0;

    if (!characterTokens) {
        const characterTypes = Array.from(document.querySelectorAll(`#workspace-section-encounter-${id} .class-button`))
            .map(el => {
                const countElement = el.querySelector('.count');
                return countElement && parseInt(countElement.innerText, 10) > 0 ? { class: el.dataset.class, count: parseInt(countElement.innerText, 10) } : null;
            })
            .filter(Boolean);
        characterTypes.forEach(({ class: type, count }) => {
            switch (type) {
                case 'wizard': partyButtonTier3Adjustment += 0.3 * count; break;
                case 'cleric': case 'bard': case 'druid': partyButtonTier2Adjustment += 0.2 * count; break;
                case 'paladin': case 'sorcerer': case 'warlock': partyButtonTier1Adjustment += 0.1 * count; break;
                case 'monk': case 'ranger': partyButtonTier1Adjustment -= 0.1 * count; break;
                default: break;
            }
        });
        document.querySelectorAll(`#workspace-section-encounter-${id} .level-button`).forEach(element => {
            const level = parseInt(element.getAttribute('data-level'), 10);
            const countElement = element.querySelector('.count');
            if (countElement) {
                const count = parseInt(countElement.innerText, 10);
                if (level >= 1 && level <= 4) totalButtonLevel1to4 += level * count;
                else if (level >= 5 && level <= 10) totalButtonLevel5to10 += level * count;
                else if (level >= 11 && level <= 16) totalButtonLevel11to16 += level * count;
                else if (level >= 17 && level <= 20) totalButtonLevel17to20 += level * count;
            }
        });
        document.querySelectorAll(`#workspace-section-tokens-content-${id} .player-card`).forEach(element => {
            if (element.getAttribute('data-type') === 'NPC') return;
            const characterClassValue = element.getAttribute('data-class');
            if (characterClassValue) {
                switch (characterClassValue) {
                    case 'wizard': partyCardTier3Adjustment += 0.3; break;
                    case 'cleric': case 'bard': case 'druid': partyCardTier2Adjustment += 0.2; break;
                    case 'paladin': case 'sorcerer': case 'warlock': partyCardTier1Adjustment += 0.1; break;
                    case 'monk': case 'ranger': partyCardTier0Adjustment -= 0.1; break;
                    default: break;
                }
            }
            const characterLevelValue = parseFloat(element.getAttribute('data-level'));
            if (!isNaN(characterLevelValue)) {
                if (characterLevelValue >= 1 && characterLevelValue <= 4) totalCardLevel1to4 += characterLevelValue;
                else if (characterLevelValue >= 5 && characterLevelValue <= 10) totalCardLevel5to10 += characterLevelValue;
                else if (characterLevelValue >= 11 && characterLevelValue <= 16) totalCardLevel11to16 += characterLevelValue;
                else if (characterLevelValue >= 17 && characterLevelValue <= 20) totalCardLevel17to20 += characterLevelValue;
            }
        });
    }
    totalLevel1to4 = totalButtonLevel1to4 === 0 ? totalCardLevel1to4 : totalCardLevel1to4 + (totalButtonLevel1to4 - totalCardLevel1to4);
    totalLevel5to10 = totalButtonLevel5to10 === 0 ? totalCardLevel5to10 : totalCardLevel5to10 + (totalButtonLevel5to10 - totalCardLevel5to10);
    totalLevel11to16 = totalButtonLevel11to16 === 0 ? totalCardLevel11to16 : totalCardLevel11to16 + (totalButtonLevel11to16 - totalCardLevel11to16);
    totalLevel17to20 = totalButtonLevel17to20 === 0 ? totalCardLevel17to20 : totalCardLevel17to20 + (totalButtonLevel17to20 - totalCardLevel17to20);
    partyLevel = (totalLevel1to4 / 4) + (totalLevel5to10 / 2) + (totalLevel11to16 * 0.75) + totalLevel17to20;
    partyLevel = partyLevel.toFixed(2);
    totalButtonTier0Adjustment = partyCardTier0Adjustment + (partyButtonTier0Adjustment - partyCardTier0Adjustment);
    totalButtonTier1Adjustment = partyCardTier1Adjustment + (partyButtonTier1Adjustment - partyCardTier1Adjustment);
    totalButtonTier2Adjustment = partyCardTier2Adjustment + (partyButtonTier2Adjustment - partyCardTier2Adjustment);
    totalButtonTier3Adjustment = partyCardTier3Adjustment + (partyButtonTier3Adjustment - partyCardTier3Adjustment);
    partyAdjustment = totalButtonTier0Adjustment + totalButtonTier1Adjustment + totalButtonTier2Adjustment + totalButtonTier3Adjustment;
    partyAdjustment = (partyAdjustment >= 0 ? '+' : '') + partyAdjustment.toFixed(2);
    const partyLevelElement = document.querySelector(`#worksheetPartyLevel-${id}`);
    if (partyLevelElement) partyLevelElement.innerText = partyLevel;
    const partyAdjustmentElement = document.querySelector(`#worksheetPartyAdjustment-${id}`);
    if (partyAdjustmentElement) partyAdjustmentElement.innerText = partyAdjustment;
    let partyCRValue = parseFloat(partyLevel) + parseFloat(partyAdjustment);
    partyCRValue = partyCRValue.toFixed(2);
    const partyCRElement = document.querySelector(`#worksheetPartyCR-${id}`);
    if (partyCRElement) partyCRElement.innerText = partyCRValue;
    const npcCRElement = document.querySelector(`#npcPartyCRValue-${id}`);
    if (npcCRElement) npcCRElement.innerText = partyCRValue;
}

function incrementLevelCount(element, levelCount, id) {
    const countSpan = element.querySelector('.count');
    let count = parseInt(countSpan.innerText, 10);
    const level = parseInt(element.getAttribute('data-level'), 10);
    const cardElements = document.querySelectorAll(`#workspace-section-tokens-content-${id} .player-card[data-level="${level}"]`);
    const minCount = cardElements.length;
    count += 1;
    countSpan.innerText = count;
    if (count === minCount) {
        element.classList.remove('active');
        element.classList.add('auto');
    } else if (count > minCount) {
        element.classList.remove('auto');
        element.classList.add('active');
        const container = document.querySelector(`#workspace-section-tokens-content-${id} .tokens-container`);
        const placeholderCard = createPlaceholderCard(id, 'level', level);
        if (container) container.appendChild(placeholderCard);
    }
    if (count === 0) {
        element.classList.remove('active');
        element.classList.remove('auto');
    }
    updateTotalPlayerCounts(id);
    updateEncounterDetails(id);
    updateCharacterTypeDisplay(element);
}

function decrementLevelCount(event, button, levelCount, id) {
    event.preventDefault();
    event.stopPropagation();
    const element = button.parentElement;
    const countSpan = element.querySelector('.count');
    let count = parseInt(countSpan.innerText, 10);
    const level = parseInt(element.getAttribute('data-level'), 10);
    const cardElements = document.querySelectorAll(`#workspace-section-tokens-content-${id} .player-card[data-level="${level}"]`);
    const minCount = cardElements.length;
    if (count > minCount) {
        count -= 1;
        countSpan.innerText = count;
    } else {
        ui.notifications.warn("The remaining class counts are set by character cards. Remove character cards from the worksheet to reduce the level count.");
    }
    if (count === minCount) {
        element.classList.remove('active');
        element.classList.add('auto');
    } else if (count > minCount) {
        element.classList.remove('auto');
        element.classList.add('active');
    } else {
        element.classList.remove('active');
        element.classList.remove('auto');
    }
    if (count === 0) {
        element.classList.remove('active');
        element.classList.remove('auto');
    }
    updateTotalPlayerCounts(id);
    updateCharacterTypeDisplay(element);
    updateEncounterDetails(id);
}

function createPlaceholderCard(id, type, value) {
    const card = document.createElement('div');
    card.className = 'player-card placeholder-card';
    card.setAttribute('data-type', 'player');
    if (type === 'level') {
        card.setAttribute('data-level', value);
        card.setAttribute('data-class', 'placeholder');
        card.innerHTML = `
            <div class="player-card-details">
                <div class="character-name">Level ${value}</div>
                <div class="character-details character-rollup">Manual Addition</div>
            </div>
            <button type="button" class="clear-button" onclick="removeCard(event, this, '${id}')">x</button>
        `;
    } else {
        card.setAttribute('data-level', '0');
        card.setAttribute('data-class', value);
        card.innerHTML = `
            <div class="player-card-details">
                <div class="character-name">${value}</div>
                <div class="character-details character-rollup">Manual Addition</div>
            </div>
            <button type="button" class="clear-button" onclick="removeCard(event, this, '${id}')">x</button>
        `;
    }
    return card;
}

function incrementCharacterType(element, characterType, id) {
    const countSpan = element.querySelector('.count');
    let count = parseInt(countSpan.innerText, 10);
    const dataClass = element.getAttribute('data-class');
    const cardElements = document.querySelectorAll(`#workspace-section-tokens-content-${id} .player-card[data-class="${dataClass}"]`);
    const minCount = cardElements.length;
    count += 1;
    countSpan.innerText = count;
    if (count === minCount) {
        element.classList.remove('active');
        element.classList.add('auto');
    } else if (count > minCount) {
        element.classList.remove('auto');
        element.classList.add('active');
        const container = document.querySelector(`#workspace-section-tokens-content-${id} .tokens-container`);
        const placeholderCard = createPlaceholderCard(id, 'class', dataClass);
        if (container) container.appendChild(placeholderCard);
    }
    updateCharacterTypeDisplay(element);
    updateTotalPlayerCounts(id);
    updateEncounterDetails(id);
}

function decrementCharacterType(event, button, characterType, id) {
    event.preventDefault();
    event.stopPropagation();
    const element = button.parentElement;
    const countSpan = element.querySelector('.count');
    let count = parseInt(countSpan.innerText, 10);
    const dataClass = element.getAttribute('data-class');
    const cardElements = document.querySelectorAll(`#workspace-section-tokens-content-${id} .player-card[data-class="${dataClass}"]`);
    const minCount = cardElements.length;
    if (count > minCount) {
        count -= 1;
        countSpan.innerText = count;
    } else {
        ui.notifications.warn("The remaining class counts are set by character cards. Remove character cards from the worksheet to reduce the class count.");
    }
    if (count === minCount) {
        element.classList.remove('active');
        element.classList.add('auto');
    } else if (count > minCount) {
        element.classList.remove('auto');
        element.classList.add('active');
    } else {
        element.classList.remove('active');
        element.classList.remove('auto');
    }
    if (count === 0) {
        element.classList.remove('active');
        element.classList.remove('auto');
    }
    updateCharacterTypeDisplay(element);
    updateTotalPlayerCounts(id);
    updateEncounterDetails(id);
}

function updateCharacterTypeDisplay(element) {
    const countSpan = element.querySelector('.count');
    const clearButton = element.querySelector('.clear-button');
    if (countSpan) {
        if (parseInt(countSpan.innerText, 10) > 0) {
            countSpan.style.display = 'inline';
            if (clearButton) clearButton.style.display = 'inline';
        } else {
            countSpan.style.display = 'none';
            if (clearButton) clearButton.style.display = 'none';
        }
    }
}

// ********************************************************
// ********** GLOBAL FUNCTIONS (cards, slider, details) ***
// ********************************************************

function removeCard(event, button, id) {
    event.preventDefault();
    event.stopPropagation();
    const card = button.closest('.player-card');
    if (!card) return;
    const cardType = card.dataset.type || 'monster';
    card.remove();
    if (cardType === 'player') {
        const cardLevel = parseInt(card.getAttribute('data-level'), 10);
        const cardClass = card.getAttribute('data-class');
        const levelButton = document.querySelector(`#workspace-section-encounter-${id} .level-button[data-level="${cardLevel}"] .clear-button`);
        if (levelButton) decrementLevelCount({ preventDefault: () => {}, stopPropagation: () => {} }, levelButton, cardLevel, id);
        const classButton = document.querySelector(`#workspace-section-encounter-${id} .class-button[data-class="${cardClass}"] .clear-button`);
        if (classButton) decrementCharacterType({ preventDefault: () => {}, stopPropagation: () => {} }, classButton, cardClass, id);
    }
    if (cardType === 'encounter') {
        const form = document.querySelector('#regent-query-workspace-narrative');
        if (form) {
            const encountersInput = form.querySelector('#input-encounters-data');
            if (encountersInput) {
                try {
                    let encountersData = JSON.parse(encountersInput.value || '[]');
                    encountersData = encountersData.filter(e => e.uuid !== card.dataset.pageUuid);
                    encountersInput.value = JSON.stringify(encountersData);
                } catch (e) {
                    console.error('BLACKSMITH | Regent: Error updating encounters data:', e);
                }
            }
        }
    } else {
        updateAllCounts(id, cardType);
    }
}

function updateAllCounts(id, cardType = null) {
    if (cardType !== 'encounter') {
        updateTotalMonsterCR(id);
        updateTotalPlayerCounts(id);
        updateTotalNPCCR(id);
        updateEncounterDetails(id);
        updateSlider(id);
    }
}

function updateSlider(id, passedValue = null) {
    const crSlider = document.getElementById(`optionCR-${id}`);
    if (!crSlider) return;
    let sliderPassedValue = passedValue;
    let heroCRValue = 0;
    let monsterCRValue = 0;
    let targetCRValue = 0;
    const upperLimitDefault = 200;
    const heroCRElement = document.getElementById(`badgeHeroCRValue-${id}`);
    if (heroCRElement) heroCRValue = parseFloat(heroCRElement.innerText.trim()) || 0;
    const monsterCRValueElement = document.querySelector(`#monsterCRValue-${id}`);
    if (monsterCRValueElement) monsterCRValue = parseFloat(monsterCRValueElement.innerText.trim()) || 0;
    const partyBenchmarkValue = parseFloat(heroCRValue) || 0;
    const monsterCRValueNumber = parseFloat(monsterCRValue) || 0;
    const maxBenchmarkOrMonsterCR = Math.max(partyBenchmarkValue, monsterCRValueNumber);
    const upperLimit = maxBenchmarkOrMonsterCR > 0 ? (maxBenchmarkOrMonsterCR * 2.5) + 10 : upperLimitDefault;
    crSlider.max = upperLimit;
    if (sliderPassedValue !== null) {
        crSlider.value = sliderPassedValue;
        targetCRValue = sliderPassedValue;
    } else {
        targetCRValue = crSlider.value;
    }
    const targetCRValueNumber = parseFloat(targetCRValue) || 0;
    document.querySelectorAll(`#targetCRValue-${id}`).forEach(element => { element.innerText = targetCRValueNumber.toFixed(2); });
    updateGapCRValue(id);
    const blnDifficultyNone = targetCRValue <= 0;
    const blnDifficultyTrivial = targetCRValue > 0 && targetCRValue < heroCRValue / 4;
    const blnDifficultyEasy = targetCRValue >= heroCRValue / 4 && targetCRValue < heroCRValue / 2;
    const blnDifficultyModerate = targetCRValue >= heroCRValue / 2 && targetCRValue < heroCRValue * 1;
    const blnDifficultyHard = targetCRValue >= heroCRValue && targetCRValue < heroCRValue * 1.5;
    const blnDifficultyDeadly = targetCRValue >= heroCRValue * 1.5 && targetCRValue < heroCRValue * 1.75;
    const blnDifficultyDeadlySlow = targetCRValue >= heroCRValue * 1.75 && targetCRValue < heroCRValue * 2;
    const blnDifficultyDeadlyMedium = targetCRValue >= heroCRValue * 2 && targetCRValue < heroCRValue * 2.25;
    const blnDifficultyImpossible = targetCRValue >= heroCRValue * 2.25;
    let encounterRating, ratingClass, iconClass;
    if (blnDifficultyNone) {
        encounterRating = "Set Difficulty"; ratingClass = "encounter-rating-none"; iconClass = "fa-solid fa-users-gear";
    } else if (blnDifficultyTrivial) {
        encounterRating = "Trivial"; ratingClass = "encounter-rating-trivial"; iconClass = "fa-solid fa-rabbit";
    } else if (blnDifficultyEasy) {
        encounterRating = "Easy"; ratingClass = "encounter-rating-easy"; iconClass = "fa-solid fa-pig";
    } else if (blnDifficultyModerate) {
        encounterRating = "Moderate"; ratingClass = "encounter-rating-medium"; iconClass = "fa-solid fa-ram";
    } else if (blnDifficultyHard) {
        encounterRating = "Hard"; ratingClass = "encounter-rating-hard"; iconClass = "fa-solid fa-dragon";
    } else if (blnDifficultyDeadly) {
        encounterRating = "Deadly"; ratingClass = "encounter-rating-deadly"; iconClass = "fa-solid fa-dragon";
    } else if (blnDifficultyDeadlySlow) {
        encounterRating = "Deadly"; ratingClass = "encounter-rating-deadly-slow"; iconClass = "fa-solid fa-dragon";
    } else if (blnDifficultyDeadlyMedium) {
        encounterRating = "Deadly"; ratingClass = "encounter-rating-deadly-medium"; iconClass = "fa-solid fa-dragon";
    } else if (blnDifficultyImpossible) {
        encounterRating = "Impossible"; ratingClass = "encounter-rating-impossible"; iconClass = "fa-solid fa-skull";
    } else {
        encounterRating = "Set Difficulty"; ratingClass = "encounter-rating-none"; iconClass = "fa-solid fa-users-gear";
    }
    const ratingElement = document.getElementById(`encounter-rating-${id}`);
    if (ratingElement) {
        ratingElement.className = `encounter-rating-badge ${ratingClass}`;
        ratingElement.innerHTML = `<i class="${iconClass}"></i> ${encounterRating}`;
    }
}

function updateEncounterDetails(id) {
    let partyLevel = 0, partyAdjustment = 0, partyCRValue = 0, targetCRValue = 0, monsterCRValue = 0;
    const partyLevelElement = document.querySelector(`#worksheetPartyLevel-${id}`);
    if (partyLevelElement) partyLevel = parseFloat(partyLevelElement.innerText) || 0;
    const partyAdjustmentElement = document.querySelector(`#worksheetPartyAdjustment-${id}`);
    if (partyAdjustmentElement) partyAdjustment = parseFloat(partyAdjustmentElement.innerText.trim()) || 0;
    const partyCRElement = document.getElementById(`worksheetPartyCR-${id}`);
    if (partyCRElement) partyCRValue = parseFloat(partyCRElement.innerText.trim()) || 0;
    const monsterCRValueElement = document.querySelector(`#monsterCRValue-${id}`);
    if (monsterCRValueElement) monsterCRValue = parseFloat(monsterCRValueElement.innerText.trim()) || 0;
    const targetCRValueElement = document.querySelector(`#targetCRValue-${id}`);
    if (targetCRValueElement) targetCRValue = parseFloat(targetCRValueElement.innerText.trim()) || 0;
    const npcCRElement = document.querySelector(`#npcNPCCRValue-${id}`);
    let npcCRValue = 0;
    if (npcCRElement) npcCRValue = parseFloat(npcCRElement.innerText) || 0;
    const badgeHeroCRElement = document.querySelector(`#badgeHeroCRValue-${id}`);
    if (badgeHeroCRElement) badgeHeroCRElement.innerText = (partyCRValue + npcCRValue).toFixed(2);
    const badgeMonsterCRElement = document.querySelector(`#badgeMonsterCRValue-${id}`);
    if (badgeMonsterCRElement) badgeMonsterCRElement.innerText = monsterCRValue.toFixed(2);
}

// Assign all to window so inline onclick in templates work (Application V2 does not run <script> in injected body).
export function registerEncounterWorksheetGlobals() {
    window.updateTotalNPCCR = updateTotalNPCCR;
    window.addNPCDropZoneHandlers = addNPCDropZoneHandlers;
    window.updateTotalMonsterCR = updateTotalMonsterCR;
    window.updateGapCRValue = updateGapCRValue;
    window.updateTotalPlayerCounts = updateTotalPlayerCounts;
    window.incrementLevelCount = incrementLevelCount;
    window.decrementLevelCount = decrementLevelCount;
    window.createPlaceholderCard = createPlaceholderCard;
    window.incrementCharacterType = incrementCharacterType;
    window.decrementCharacterType = decrementCharacterType;
    window.updateCharacterTypeDisplay = updateCharacterTypeDisplay;
    window.removeCard = removeCard;
    window.updateAllCounts = updateAllCounts;
    window.updateSlider = updateSlider;
    window.updateEncounterDetails = updateEncounterDetails;
}
