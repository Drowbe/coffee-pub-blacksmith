// CARD THEMES
export const dataTheme = {
    "themes": [
        {
            "name": "Simple (Native Foundry)",
            "id": "cardsdefault",
            "constantname": "THEMEDEFAULT",
            "path": "cardsdefault",
            "tags": ["theme", "default", "simple"],
            "type": "theme",
            "category": "theme",
            "description": "The default theme of Foundry VTT seamlessly blends simplicity with functionality, creating an intuitive platform where epic adventures unfold."
        },  
        {
            "name": "Dark And Stormy",
            "id": "cardsdark",
            "constantname": "THEMEDARK",
            "path": "cardsdark",
            "tags": ["theme", "dark", "stormy"],
            "type": "theme",
            "category": "theme",
            "description": "This dark theme envelops your tabletop in a brooding atmosphere where shadows dance and lightning crackles, creating the perfect backdrop for mysterious adventures."
        },
        {
            "name": "Blue Velvet",
            "id": "cardsblue",
            "constantname": "THEMEBLUE",
            "path": "cardsblue",
            "tags": ["theme", "blue", "velvet"],
            "type": "theme",
            "category": "theme",
            "description": "Immerse yourself in a realm of noble elegance where deep blues and rich details create an atmosphere of majestic sophistication."
        },
        {
            "name": "Red Wine",
            "id": "cardsred",
            "constantname": "THEMERED",
            "path": "cardsred",
            "tags": ["theme", "red", "wine"],
            "type": "theme",
            "category": "theme",
            "description": "Savor the bold elegance of this wine-inspired theme, where rich crimson hues create an atmosphere of sophisticated luxury."
        },
        {
            "name": "Green Moss",
            "id": "cardsgreen",
            "constantname": "THEMEGREEN",
            "path": "cardsgreen",
            "tags": ["theme", "green", "moss"],
            "type": "theme",
            "category": "theme",
            "description": "Embrace the tranquil beauty of nature with this moss-inspired theme, where verdant hues create a refreshing sanctuary of peace."
        },
        {
            "name": "Brown Earth",
            "id": "cardsbrown",
            "constantname": "THEMEBROWN",
            "path": "cardsbrown",
            "tags": ["theme", "brown", "earth"],
            "type": "theme",
            "category": "theme",
            "description": "Ground your adventures in the warm embrace of earth-toned hues that echo the natural richness and stability of soil."
        }
    ]
};
// BACKGROUND IMAGES
export const dataBackgroundImages = {
    "images": [
        {
            "name": "None (Uses Theme Color)",
            "id": "themecolor",
            "constantname": "BACKTHEMECOLOR",
            "path": "",
            "tags": ["background", "theme", "color"],
            "type": "image",
            "category": "background"
        },  
        {
            "name": "Brick",
            "id": "brick",
            "constantname": "BACKBRICK",
            "filename": ""
        },  
        {
            "name": "Dessert",
            "id": "dessert",
            "constantname": "BACKDESSERT",
            "filename": ""
        }, 
        {
            "name": "Dirt",
            "id": "dirt",
            "constantname": "BACKDIRT",
            "filename": ""
        }, 
        {
            "name": "Grass",
            "id": "grass",
            "constantname": "BACKGRASS",
            "filename": ""
        }, 
        {
            "name": "Rock",
            "id": "rock",
            "constantname": "BACKROCK",
            "filename": ""
        }, 
        {
            "name": "Stone",
            "id": "stone",
            "constantname": "BACKSTONE",
            "filename": ""
        }, 
        {
            "name": "Cobblestone",
            "id": "cobblestone",
            "constantname": "BACKCOBBLESTONE",
            "filename": ""
        }, 
        {
            "name": "Stone Floor",
            "id": "stonefloor",
            "constantname": "BACKSTONEFLOOR",
            "filename": ""
        }, 

        {
            "name": "Parchment",
            "id": "parchment",
            "constantname": "BACKPARCHMENT",
            "filename": ""
        },

        {
            "name": "Light Cloth",
            "id": "clothlight",
            "constantname": "BACKCLOTHLIGHT",
            "filename": ""
        },

        {
            "name": "Dark Cloth",
            "id": "clothdark",
            "constantname": "BACKCLOTHDARK",
            "filename": ""
        },


    ]
};
// Icons
export const dataIcons = {
    "icons": [
        {
            "name": "No Icon (Select One)",
            "id": "none",
        },
        {
            "name": "Chess: Queen",
            "id": "fa-chess-queen",
        },
        {
            "name": "Chess: King",
            "id": "fa-chess-king",
        },
        {
            "name": "Chess: Rook",
            "id": "fa-chess-rook",
        },
        {
            "name": "Fist",
            "id": "fa-hand-fist",
        },
        {
            "name": "Paw",
            "id": "fa-paw",
        },
        {
            "name": "Shield",
            "id": "fa-shield",
        },
        {
            "name": "Skull",
            "id": "fa-skull",
        },
        {
            "name": "Coffee Pot",
            "id": "fa-coffee-pot",
        },
    ]
};


// Nameplates
export const dataNameplate = {
    "names": [
        {
            "name": "Do Not Change Token Names",
            "id": "none"
        },
        {
            "name": "Replace Token with Name",
            "id": "name-replace"
        },
        {
            "name": "Append Name: Token Name",
            "id": "name-append-end"
        },
        {
            "name": "Append Name: Name Token",
            "id": "name-append-start"
        },
        {
            "name": "Append Name: Token (Name)",
            "id": "name-append-end-parenthesis"
        },
        {
            "name": "Append Name: Name (Token)",
            "id": "name-append-start-parenthesis"
        },
        {
            "name": "Append Name: Token - Name",
            "id": "name-append-end-dash"
        },
        {
            "name": "Append Name: Name - Token",
            "id": "name-append-start-dash"
        },
        {
            "name": "Append Number: Token 01",
            "id": "number-append-end"
        },
        {
            "name": "Append Number: Token (01)",
            "id": "number-append-end-parenthesis"
        },
        {
            "name": "Append Number: Token - 01",
            "id": "number-append-end-dash"
        }
    ]
};

// Sounds modules/coffee-pub-blacksmith/sounds/clatter.mp3
export const dataSounds = {
    "sounds": [
        {
            "name": "No Sound",
            "id": "none",
        },

        // General Sounds
        {
            "name": "General: Arrow",
            "id": "modules/coffee-pub-blacksmith/sounds/arrow.mp3",
        },
        {
            "name": "General: Battlecry",
            "id": "modules/coffee-pub-blacksmith/sounds/battlecry.mp3",
        },
        {
            "name": "General: Bell",
            "id": "modules/coffee-pub-blacksmith/sounds/bell.mp3",
        },
        {
            "name": "General: Charm",
            "id": "modules/coffee-pub-blacksmith/sounds/charm.mp3",
        },
        {
            "name": "General: Clatter",
            "id": "modules/coffee-pub-blacksmith/sounds/clatter.mp3",
        },
        {
            "name": "General: Cocktail Ice",
            "id": "modules/coffee-pub-blacksmith/sounds/general-cocktail-ice.mp3",
        },
        {
            "name": "General: Gong",
            "id": "modules/coffee-pub-blacksmith/sounds/gong.mp3",
        },
        {
            "name": "General: Greataxe",
            "id": "modules/coffee-pub-blacksmith/sounds/greataxe.mp3",
        },
        {
            "name": "General: Notification",
            "id": "modules/coffee-pub-blacksmith/sounds/notification.mp3",
        },
        {
            "name": "General: Synth",
            "id": "modules/coffee-pub-blacksmith/sounds/synth.mp3",
        },
        {
            "name": "General: Toilet Flushing",
            "id": "modules/coffee-pub-blacksmith/sounds/general-toilet-flushing.mp3",
        },

        // Interface Sounds
        {
            "name": "Interface: Button 01",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-01.mp3",
            "constantname": "SOUNDBUTTON01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-01.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 02",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-02.mp3",
            "constantname": "SOUNDBUTTON02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-02.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 03",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-03.mp3",
            "constantname": "SOUNDBUTTON03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-03.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 04",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-04.mp3",
            "constantname": "SOUNDBUTTON04",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-04.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 05",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-05.mp3",
            "constantname": "SOUNDBUTTON05",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-05.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 06",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-06.mp3",
            "constantname": "SOUNDBUTTON06",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-06.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 07",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-07.mp3",
            "constantname": "SOUNDBUTTON07",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-07.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 08",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-08.mp3",
            "constantname": "SOUNDBUTTON08",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-08.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 09",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3",
            "constantname": "SOUNDBUTTON09",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 10",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-10.mp3",
            "constantname": "SOUNDBUTTON10",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-10.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 11",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-11.mp3",
            "constantname": "SOUNDBUTTON11",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-11.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 12",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-button-12.mp3",
            "constantname": "SOUNDBUTTON12",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-12.mp3",
            "tags": ["interface", "button"],
            "type": "sound",
            "category": "interface"
        },

        // Interface Errors
        {
            "name": "Interface: Error 01",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-01.mp3",
            "constantname": "SOUNDERROR01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-01.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 02",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-02.mp3",
            "constantname": "SOUNDERROR02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-02.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 03",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-03.mp3",
            "constantname": "SOUNDERROR03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-03.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 04",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-04.mp3",
            "constantname": "SOUNDERROR04",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-04.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 05",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-05.mp3",
            "constantname": "SOUNDERROR05",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-05.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 06",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-06.mp3",
            "constantname": "SOUNDERROR06",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-06.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 07",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-07.mp3",
            "constantname": "SOUNDERROR07",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-07.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 08",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-08.mp3",
            "constantname": "SOUNDERROR08",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-08.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 09",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-09.mp3",
            "constantname": "SOUNDERROR09",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-09.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 10",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-10.mp3",
            "constantname": "SOUNDERROR10",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-10.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 11",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-error-11.mp3",
            "constantname": "SOUNDERROR11",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-11.mp3",
            "tags": ["interface", "error"],
            "type": "sound",
            "category": "interface"
        },

        // Interface Notifications
        {
            "name": "Interface: Notification 01",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3",
            "constantname": "SOUNDNOTIFICATION01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 02",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-02.mp3",
            "constantname": "SOUNDNOTIFICATION02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-02.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 03",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-03.mp3",
            "constantname": "SOUNDNOTIFICATION03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-03.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 04",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-04.mp3",
            "constantname": "SOUNDNOTIFICATION04",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-04.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 05",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-05.mp3",
            "constantname": "SOUNDNOTIFICATION05",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-05.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 06",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-06.mp3",
            "constantname": "SOUNDNOTIFICATION06",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-06.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 07",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-07.mp3",
            "constantname": "SOUNDNOTIFICATION07",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-07.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 08",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-08.mp3",
            "constantname": "SOUNDNOTIFICATION08",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-08.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 09",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-09.mp3",
            "constantname": "SOUNDNOTIFICATION09",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-09.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 10",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-10.mp3",
            "constantname": "SOUNDNOTIFICATION10",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-10.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 11",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-11.mp3",
            "constantname": "SOUNDNOTIFICATION11",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-11.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 12",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-12.mp3",
            "constantname": "SOUNDNOTIFICATION12",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-12.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 13",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-13.mp3",
            "constantname": "SOUNDNOTIFICATION13",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-13.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 14",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-14.mp3",
            "constantname": "SOUNDNOTIFICATION14",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-14.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 15",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-notification-15.mp3",
            "constantname": "SOUNDNOTIFICATION15",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-15.mp3",
            "tags": ["interface", "notification"],
            "type": "sound",
            "category": "interface"
        },

        // Interface Other
        {
            "name": "Interface: Open 01",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-open-01.mp3",
            "constantname": "SOUNDDEFAULTFILE"
        },
        {
            "name": "Interface: Ping 01",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-ping-01.mp3",
        },
        {
            "name": "Interface: Pop 01",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3",
            "constantname": "SOUNDPOP01"
        },
        {
            "name": "Interface: Pop 02",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3",
            "constantname": "SOUNDPOP02"
        },
        {
            "name": "Interface: Pop 03",
            "id": "modules/coffee-pub-blacksmith/sounds/interface-pop-03.mp3",
            "constantname": "SOUNDPOP03"
        },

        // Books
        {
            "name": "Book: Flip 01",
            "id": "modules/coffee-pub-blacksmith/sounds/book-flip-01.mp3",
            "constantname": "SOUNDEFFECTBOOK01"
        },
        {
            "name": "Book: Flip 02",
            "id": "modules/coffee-pub-blacksmith/sounds/book-flip-02.mp3",
            "constantname": "SOUNDEFFECTBOOK02"
        },
        {
            "name": "Book: Open 02",
            "id": "modules/coffee-pub-blacksmith/sounds/book-open-02.mp3",
            "constantname": "SOUNDEFFECTBOOK03"
        },
        {
            "name": "Book: Take 01",
            "id": "modules/coffee-pub-blacksmith/sounds/book-take-01.mp3",
            "constantname": "SOUNDEFFECTBOOK04"
        },

        // Chest and Items
        {
            "name": "Chest: Open",
            "id": "modules/coffee-pub-blacksmith/sounds/chest-open.mp3",
            "constantname": "SOUNDEFFECTCHEST01"
        },
        {
            "name": "Chest: Treasure",
            "id": "modules/coffee-pub-blacksmith/sounds/chest-treasure.mp3",
            "constantname": "SOUNDEFFECTCHEST02"
        },

        // Effects and Magic
        {
            "name": "Effect: Sad Trombone",
            "id": "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
            "constantname": "SOUNDSADTROMBONE"
        },
        {
            "name": "Magic: Spell Magic Circle",
            "id": "modules/coffee-pub-blacksmith/sounds/spell-magic-circle.mp3",
            "constantname": "SOUNDSPELLMAGICCIRCLE"
        },

        // Nature and Environment
        {
            "name": "Nature: Rustling Grass",
            "id": "modules/coffee-pub-blacksmith/sounds/rustling-grass.mp3",
        },
        {
            "name": "Nature: Beast Owl Hoot",
            "id": "modules/coffee-pub-blacksmith/sounds/beast-owl-hoot.mp3",
        },
        {
            "name": "Nature: Fire Candle Blow",
            "id": "modules/coffee-pub-blacksmith/sounds/fire-candle-blow.mp3",
        },

        // Reactions
        {
            "name": "Reaction: Ahhhhh",
            "id": "modules/coffee-pub-blacksmith/sounds/reaction-ahhhhh.mp3",
            "constantname": "SOUNDREACTIONAHHHH"
        },
        {
            "name": "Reaction: Oooooh",
            "id": "modules/coffee-pub-blacksmith/sounds/reaction-oooooh.mp3",
            "constantname": "SOUNDREACTIONOOOOOH"
        },
        {
            "name": "Reaction: Yay",
            "id": "modules/coffee-pub-blacksmith/sounds/reaction-yay.mp3",
            "constantname": "SOUNDREACTIONYAY"
        },

        // Weapons
        {
            "name": "Weapon: Sword Blade Swish",
            "id": "modules/coffee-pub-blacksmith/sounds/weapon-sword-blade-swish.mp3",
            "constantname": "SOUNDEFFECTWEAPON01"
        },
        {
            "name": "Weapon: Greataxe",
            "id": "modules/coffee-pub-blacksmith/sounds/greataxe.mp3",
            "constantname": "SOUNDEFFECTWEAPON02"
        },
        {
            "name": "Weapon: Arrow",
            "id": "modules/coffee-pub-blacksmith/sounds/arrow.mp3",
            "constantname": "SOUNDEFFECTWEAPON03"
        },

        // Instruments
        {
            "name": "Instrument: Sad Trombone",
            "id": "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT01"
        },
        {
            "name": "Instrument: Fanfare Harp",
            "id": "modules/coffee-pub-blacksmith/sounds/fanfare-harp.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT02"
        },
        {
            "name": "Instrument: Bell",
            "id": "modules/coffee-pub-blacksmith/sounds/bell.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT03"
        },
        {
            "name": "Instrument: Gong",
            "id": "modules/coffee-pub-blacksmith/sounds/gong.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT04"
        },

        // General Effects
        {
            "name": "General: Rustling Grass",
            "id": "modules/coffee-pub-blacksmith/sounds/rustling-grass.mp3",
            "constantname": "SOUNDEFFECTGENERAL01"
        },
        {
            "name": "General: Synth",
            "id": "modules/coffee-pub-blacksmith/sounds/synth.mp3",
            "constantname": "SOUNDEFFECTGENERAL03"
        },
        {
            "name": "General: Charm",
            "id": "modules/coffee-pub-blacksmith/sounds/charm.mp3",
            "constantname": "SOUNDEFFECTGENERAL05"
        },
        {
            "name": "General: Clatter",
            "id": "modules/coffee-pub-blacksmith/sounds/clatter.mp3",
            "constantname": "SOUNDEFFECTGENERAL06"
        },
        {
            "name": "General: Cocktail Ice",
            "id": "modules/coffee-pub-blacksmith/sounds/general-cocktail-ice.mp3",
            "constantname": "SOUNDEFFECTGENERAL08"
        },
        {
            "name": "General: Toilet Flush",
            "id": "modules/coffee-pub-blacksmith/sounds/general-toilet-flush.mp3",
            "constantname": "SOUNDEFFECTGENERAL09"
        },

        // Battle Cry
        {
            "name": "Battle Cry",
            "id": "modules/coffee-pub-blacksmith/sounds/battlecry.mp3",
            "constantname": "SOUNDEFFECTREACTION04"
        }
    ]
};

// VOLUME CONSTANTS
export const dataVolume = {
    "volumes": [
        {
            "name": "Loud",
            "id": "0.8",
            "constantname": "SOUNDVOLUMELOUD",
            "description": "Loud volume level for dramatic effects"
        },
        {
            "name": "Normal",
            "id": "0.5",
            "constantname": "SOUNDVOLUMENORMAL", 
            "description": "Standard volume level for most sounds"
        },
        {
            "name": "Soft",
            "id": "0.3",
            "constantname": "SOUNDVOLUMESOFT",
            "description": "Soft volume level for subtle effects"
        }
    ]
};

// BANNER IMAGES
export const dataBanners = {
    "banners": [
        // Hero Banners
        {
            "name": "Heroes 01",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-heros-1.webp",
            "constantname": "BANNERHEROES01",
            "category": "heroes",
            "description": "Heroic banner for player characters"
        },
        {
            "name": "Heroes 02", 
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-heros-2.webp",
            "constantname": "BANNERHEROES02",
            "category": "heroes",
            "description": "Heroic banner for player characters"
        },
        {
            "name": "Heroes 03",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-heros-3.webp", 
            "constantname": "BANNERHEROES03",
            "category": "heroes",
            "description": "Heroic banner for player characters"
        },
        {
            "name": "Narration: Crypt 01",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-1.webp",
            "constantname": "BANNERHEROES04",
            "category": "heroes",
            "description": "Crypt narration banner"
        },
        {
            "name": "Narration: Crypt 02",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-2.webp",
            "constantname": "BANNERHEROES05",
            "category": "heroes", 
            "description": "Crypt narration banner"
        },
        {
            "name": "Narration: Forest 01",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-1.webp",
            "constantname": "BANNERHEROES06",
            "category": "heroes",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Forest 02",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-2.webp",
            "constantname": "BANNERHEROES07",
            "category": "heroes",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Forest 03",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-3.webp",
            "constantname": "BANNERHEROES08",
            "category": "heroes",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Forest 04",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-4.webp",
            "constantname": "BANNERHEROES09",
            "category": "heroes",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Jungle 01",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-narration-jungle-1.webp",
            "constantname": "BANNERHEROES10",
            "category": "heroes",
            "description": "Jungle narration banner"
        },

        // Monster Banners
        {
            "name": "Dragon",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-dragon.webp",
            "constantname": "BANNERMONSTER01",
            "category": "monster",
            "description": "Dragon monster banner"
        },
        {
            "name": "Minotaur",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-minotaur.webp",
            "constantname": "BANNERMONSTER02",
            "category": "monster",
            "description": "Minotaur monster banner"
        },
        {
            "name": "Wraith 01",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-wraith-1.webp",
            "constantname": "BANNERMONSTER03",
            "category": "monster",
            "description": "Wraith monster banner"
        },
        {
            "name": "Wraith 02",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-wraith-2.webp",
            "constantname": "BANNERMONSTER04",
            "category": "monster",
            "description": "Wraith monster banner"
        },

        // Landscape Banners
        {
            "name": "Landscape: Winter 01",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-1.webp",
            "constantname": "BANNERLANDSCAPE01",
            "category": "landscape",
            "description": "Winter landscape banner"
        },
        {
            "name": "Landscape: Winter 02",
            "id": "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-2.webp",
            "constantname": "BANNERLANDSCAPE02",
            "category": "landscape",
            "description": "Winter landscape banner"
        }
    ]
};

// MVP Templates
export const MVPTemplates = {
    combatExcellenceTemplates: [
        "Dominated the battlefield with {hits} precise strikes ({accuracy}% accuracy), including {crits} devastating critical hits for {damage} damage",
        "Led the charge with exceptional skill, landing {hits} attacks at {accuracy}% accuracy and dealing {damage} damage with {crits} critical strikes",
        "Demonstrated masterful combat prowess: {hits} successful strikes, {crits} critical hits, and {damage} total damage at {accuracy}% accuracy",
        "Carved through enemies with {hits} well-placed attacks, achieving {accuracy}% accuracy and {crits} critical hits for {damage} damage",
        "Showcased elite combat skills with {hits} hits ({accuracy}% accuracy), including {crits} critical strikes dealing {damage} damage",
        "Executed a flawless assault: {hits} successful attacks, {damage} damage dealt, and {crits} critical hits at {accuracy}% accuracy",
        "Displayed tactical brilliance with {hits} precise attacks, {crits} critical strikes, and {damage} total damage at {accuracy}% accuracy",
        "Orchestrated a devastating offensive: {hits} successful strikes dealing {damage} damage, including {crits} critical hits ({accuracy}% accuracy)",
        "Commanded the battlefield with {hits} accurate strikes ({accuracy}%), delivering {crits} critical hits and {damage} total damage",
        "Unleashed a masterful performance: {hits} successful attacks at {accuracy}% accuracy, dealing {damage} damage with {crits} critical strikes"
    ],
    
    damageTemplates: [
        "Unleashed {damage} points of destruction through {hits} attacks, with {crits} critical strikes and {healing} healing provided",
        "Dealt a staggering {damage} damage across {hits} successful strikes while supporting with {healing} healing and landing {crits} critical hits",
        "Brought devastating force with {damage} damage dealt, {hits} successful attacks, and {crits} critical hits while healing {healing}",
        "Channeled raw power into {damage} damage through {hits} strikes, including {crits} critical hits and {healing} healing support",
        "Delivered {damage} crushing damage with {hits} well-placed attacks, {crits} critical strikes, and {healing} healing provided",
        "Manifested destructive might: {damage} damage dealt, {hits} successful hits, {crits} critical strikes, and {healing} healing",
        "Wreaked havoc with {damage} total damage, landing {hits} attacks and {crits} critical hits while healing {healing}",
        "Demonstrated overwhelming force: {damage} damage across {hits} strikes, with {crits} critical hits and {healing} healing",
        "Unleashed {damage} points of devastation through {hits} attacks, scoring {crits} critical hits and providing {healing} healing",
        "Dominated through pure power: {damage} damage dealt, {hits} successful strikes, {crits} critical hits, and {healing} healing support"
    ],
    
    precisionTemplates: [
        "Demonstrated lethal precision with {hits}/{attempts} strikes connecting ({accuracy}%), dealing {damage} damage with {crits} critical hits",
        "Achieved remarkable accuracy ({accuracy}%) with {hits}/{attempts} successful strikes, including {crits} critical hits for {damage} damage",
        "Displayed surgical precision: {hits} of {attempts} attacks hit ({accuracy}%), dealing {damage} damage and scoring {crits} critical hits",
        "Executed with deadly accuracy, landing {hits}/{attempts} attacks ({accuracy}%) for {damage} damage and {crits} critical strikes",
        "Showcased masterful aim with {accuracy}% accuracy ({hits}/{attempts}), delivering {damage} damage and {crits} critical hits",
        "Maintained exceptional precision: {hits}/{attempts} successful strikes ({accuracy}%), {damage} damage dealt, {crits} critical hits",
        "Demonstrated unerring accuracy with {hits}/{attempts} hits ({accuracy}%), dealing {damage} damage including {crits} critical strikes",
        "Displayed pinpoint accuracy: {accuracy}% of {attempts} attacks hit, dealing {damage} damage with {crits} critical hits",
        "Achieved combat excellence with {hits}/{attempts} successful strikes ({accuracy}%), {damage} damage, and {crits} critical hits",
        "Exhibited deadly precision: {accuracy}% accuracy across {attempts} attacks, dealing {damage} damage with {crits} critical strikes"
    ],
    
    mixedTemplates: [
        "Despite {fumbles} setbacks, delivered {damage} damage across {hits} strikes with {crits} critical hits and {healing} healing",
        "Overcame {fumbles} mishaps to deal {damage} damage, land {hits} attacks, score {crits} critical hits, and heal {healing}",
        "Persevered through {fumbles} fumbles, achieving {hits} successful strikes, {damage} damage, and {healing} healing with {crits} critical hits",
        "Showed resilience after {fumbles} stumbles: {hits} successful attacks, {damage} damage dealt, {crits} critical hits, {healing} healing",
        "Recovered from {fumbles} missteps to deliver {damage} damage, {hits} successful strikes, {crits} critical hits, and {healing} healing",
        "Pushed through {fumbles} setbacks to achieve {hits} hits, {damage} damage, {crits} critical strikes, and {healing} healing",
        "Demonstrated persistence through {fumbles} fumbles: {damage} damage dealt, {hits} successful attacks, {crits} crits, {healing} healed",
        "Adapted past {fumbles} mistakes to land {hits} strikes, deal {damage} damage, score {crits} critical hits, and heal {healing}",
        "Rallied after {fumbles} fumbles with {hits} successful attacks, dealing {damage} damage with {crits} critical hits and {healing} healing",
        "Turned the tide despite {fumbles} setbacks: {hits} successful strikes, {damage} damage, {crits} critical hits, {healing} healing provided"
    ],

    noMVPTemplates: [
        "No MVP: Everyone's playing it a bit too safe this round. Time to channel your inner hero!",
        "No MVP: The enemies seem to be winning the game of hide and seek. Maybe try seeking harder?",
        "No MVP: Looks like everyone's practicing their defensive stances. Remember, the best defense is a good offense!",
        "No MVP: No MVP this round - but hey, at least no one rolled a natural 1... right?",
        "No MVP: The weapons are feeling a bit shy today. Give them some encouragement!",
        "No MVP: Someone forgot to bring their lucky dice. There's always next round!",
        "No MVP: The party seems to be having a peaceful tea party instead of combat. Time to spice things up!",
        "No MVP: Today's combat sponsored by: The 'Maybe Next Time' Foundation for Aspiring Heroes",
        "No MVP: The enemies are starting to think this is too easy. Show them why they're wrong!",
        "No MVP: Saving all your good rolls for later? That's a bold strategy!"
    ]
};
