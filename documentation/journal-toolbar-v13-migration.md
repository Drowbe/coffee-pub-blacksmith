# Journal Toolbar Migration Guide for FoundryVTT v13

This document outlines the key changes needed to make journal toolbars work in FoundryVTT v13, based on our migration experience with Coffee Pub Scribe.

## Key Challenges in v13

1. **Hooks may not fire reliably** - `renderJournalPageSheet` hooks might not execute when expected
2. **jQuery removal** - All DOM manipulation must use native JavaScript APIs
3. **Dynamic content rendering** - Journal pages may render asynchronously, requiring observers
4. **DOM structure changes** - Elements may be nested differently or rendered at different times

## Critical Changes

### 1. jQuery to Native DOM Conversion

**Always detect and convert jQuery objects:**

```javascript
// v13: Detect and convert jQuery to native DOM if needed
let nativeHtml = html;
if (html && (html.jquery || typeof html.find === 'function')) {
    nativeHtml = html[0] || html.get?.(0) || html;
}
```

**Use native DOM methods:**
- `html.find('.selector')` → `nativeHtml.querySelector('.selector')`
- `html.find('.selector').each()` → `nativeHtml.querySelectorAll('.selector').forEach()`
- `$element.append()` → `element.appendChild()` or `element.insertAdjacentHTML('beforeend', ...)`
- `$element.before()` → `element.insertAdjacentElement('beforebegin', ...)`

### 2. Multiple Hook Registration Strategies

**Problem:** Hooks might not fire or fire at unexpected times.

**Solution:** Use multiple strategies:

```javascript
// Strategy 1: Register with hook manager (if using one)
const hookId = hookManager.registerHook({
    name: 'renderJournalSheet',
    callback: (journalSheet, html, data) => {
        // Your code
    }
});

// Strategy 2: Direct Foundry hook registration (fallback)
Hooks.on('renderJournalSheet', (journalSheet, html, data) => {
    // Same code
});

// Strategy 3: Also hook into renderJournalPageSheet for page-level content
Hooks.on('renderJournalPageSheet', (journalPageSheet, html, data) => {
    // Page-specific code
});
```

### 3. Accessing Journal Sheet Element

**The `html` parameter might not contain what you expect. Use the sheet's element:**

```javascript
Hooks.on('renderJournalSheet', (journalSheet, html, data) => {
    // Get the actual sheet element
    let sheetElement = html;
    if (html && (html.jquery || typeof html.find === 'function')) {
        sheetElement = html[0] || html.get?.(0) || html;
    }
    
    // Or use journalSheet.element directly (with jQuery detection)
    if (journalSheet.element) {
        let element = journalSheet.element;
        if (element.jquery || typeof element.find === 'function') {
            element = element[0] || element.get?.(0) || element;
        }
        sheetElement = element || sheetElement;
    }
    
    // Now use sheetElement for queries
    const windowHeader = sheetElement.querySelector('.window-header');
    // ...
});
```

### 4. Adding Buttons to Header/Toolbar

**Example: Adding a button to journal header**

```javascript
Hooks.on('renderJournalSheet', (journalSheet, html, data) => {
    // Convert to native DOM
    let nativeHtml = html;
    if (html && (html.jquery || typeof html.find === 'function')) {
        nativeHtml = html[0] || html.get?.(0) || html;
    }
    
    // Find the header
    const windowHeader = nativeHtml.querySelector('.window-header');
    if (!windowHeader) return;
    
    // Check if button already exists
    if (windowHeader.querySelector('.my-custom-button')) return;
    
    // Create button element
    const button = document.createElement('a');
    button.className = 'header-button control my-custom-button';
    button.href = '#';
    button.title = 'My Button';
    button.innerHTML = '<i class="fa-solid fa-icon"></i> Label';
    
    // Insert before close button
    const closeButton = windowHeader.querySelector('.close');
    if (closeButton) {
        closeButton.insertAdjacentElement('beforebegin', button);
    } else {
        windowHeader.appendChild(button);
    }
    
    // Add event listener (use addEventListener, not onclick in HTML)
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Your handler code
    });
    
    // Defensive: Re-assign after delay to catch re-renders
    setTimeout(() => {
        const btn = windowHeader.querySelector('.my-custom-button');
        if (btn && !btn.hasAttribute('data-listener-added')) {
            btn.setAttribute('data-listener-added', 'true');
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                // Handler
            });
        }
    }, 50);
});
```

### 5. Handling Dynamic Content with MutationObserver

**Problem:** Content may render asynchronously after hooks fire.

**Solution:** Use MutationObserver to watch for changes:

```javascript
Hooks.on('renderJournalSheet', (journalSheet, html, data) => {
    // ... convert to native DOM ...
    
    // Set up observer to watch for content changes
    const observer = new MutationObserver((mutations) => {
        // Check if your target elements exist now
        const targetElements = sheetElement.querySelectorAll('.your-target');
        if (targetElements.length > 0) {
            // Process them
            processElements(targetElements);
        }
    });
    
    // Observe the sheet element
    observer.observe(sheetElement, { 
        childList: true, 
        subtree: true 
    });
});
```

### 6. Multiple Delays for Late-Rendering Content

**Problem:** Some content renders after hooks complete.

**Solution:** Use multiple timeouts to catch different render timings:

```javascript
Hooks.on('renderJournalSheet', (journalSheet, html, data) => {
    // ... setup ...
    
    // Immediate attempt
    addToolbar(sheetElement);
    
    // Delayed attempts for late-rendering content
    setTimeout(() => addToolbar(sheetElement), 100);
    setTimeout(() => addToolbar(sheetElement), 500);
    setTimeout(() => addToolbar(sheetElement), 1000);
});
```

### 7. Global Fallback Observer

**Problem:** Hooks might not fire at all.

**Solution:** Set up a global observer as a fallback:

```javascript
let globalJournalObserver = null;

Hooks.once('ready', () => {
    globalJournalObserver = new MutationObserver((mutations) => {
        // Find all journal sheets in document
        const journalSheets = document.querySelectorAll('.journal-sheet.journal-entry');
        journalSheets.forEach((sheet) => {
            // Check if your toolbar is already added
            if (!sheet.querySelector('.your-toolbar')) {
                addToolbar(sheet);
            }
        });
    });
    
    // Observe document body
    globalJournalObserver.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false
    });
    
    // Also check periodically
    setInterval(() => {
        const journalSheets = document.querySelectorAll('.journal-sheet.journal-entry');
        journalSheets.forEach((sheet) => {
            if (!sheet.querySelector('.your-toolbar')) {
                addToolbar(sheet);
            }
        });
    }, 2000); // Check every 2 seconds
});
```

### 8. Searching for Elements - Multiple Strategies

**Problem:** Elements might be in different locations.

**Solution:** Try multiple search strategies:

```javascript
function findElements(searchRoot) {
    // Strategy 1: Direct search
    let elements = searchRoot.querySelectorAll('.journal-page-content .target');
    
    // Strategy 2: Broader search if not found
    if (elements.length === 0) {
        const journalPages = searchRoot.querySelector('.journal-entry-pages');
        if (journalPages) {
            elements = journalPages.querySelectorAll('.target');
        }
    }
    
    // Strategy 3: Document-wide search as last resort
    if (elements.length === 0) {
        elements = document.querySelectorAll('.journal-sheet .target');
    }
    
    return elements;
}
```

## Complete Example: Adding Header Button

```javascript
Hooks.on('ready', () => {
    // Register hook for journal sheets
    Hooks.on('renderJournalSheet', (journalSheet, html, data) => {
        // Convert to native DOM
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Get sheet element
        let sheetElement = nativeHtml;
        if (journalSheet.element) {
            let element = journalSheet.element;
            if (element.jquery || typeof element.find === 'function') {
                element = element[0] || element.get?.(0) || element;
            }
            sheetElement = element || nativeHtml;
        }
        
        // Find header
        const windowHeader = sheetElement.querySelector('.window-header');
        if (!windowHeader) return;
        
        // Check if button exists
        if (windowHeader.querySelector('.my-module-button')) return;
        
        // Create and insert button
        const button = document.createElement('a');
        button.className = 'header-button control my-module-button';
        button.href = '#';
        button.title = 'My Module';
        button.innerHTML = '<i class="fa-solid fa-star"></i> My Button';
        
        const closeButton = windowHeader.querySelector('.close');
        if (closeButton) {
            closeButton.insertAdjacentElement('beforebegin', button);
        } else {
            windowHeader.appendChild(button);
        }
        
        // Add event listener
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Your functionality here
            console.log('Button clicked!');
        });
        
        // Defensive re-assignment
        setTimeout(() => {
            const btn = windowHeader.querySelector('.my-module-button');
            if (btn) {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    console.log('Button clicked!');
                });
            }
        }, 50);
    });
    
    // Global fallback observer
    const observer = new MutationObserver(() => {
        document.querySelectorAll('.journal-sheet.journal-entry').forEach((sheet) => {
            const header = sheet.querySelector('.window-header');
            if (header && !header.querySelector('.my-module-button')) {
                // Add button logic here
            }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
});
```

## Key Takeaways

1. **Always detect jQuery** - Defensive conversion pattern is essential
2. **Use multiple strategies** - Don't rely on a single hook or timing
3. **MutationObserver is your friend** - Essential for dynamic content
4. **Multiple timeouts** - Content renders at different times
5. **Global fallback** - When hooks fail, fall back to document observers
6. **Native DOM APIs only** - No jQuery methods

## Testing Checklist

- [ ] Toolbar appears when journal opens
- [ ] Toolbar appears after switching journal pages
- [ ] Toolbar persists after journal re-renders
- [ ] Buttons are clickable and functional
- [ ] No console errors
- [ ] Works with multiple journal windows open
- [ ] Works in edit mode (if applicable)

