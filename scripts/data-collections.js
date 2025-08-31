// CARD THEMES
export const dataTheme = {
    "themes": [
        {
            "name": "Simple (Native Foundry)",
            "id": "theme-default",
            "constantname": "THEMEDEFAULT",
            "path": "cardsdefault",
            "tags": ["theme", "default", "simple", "foundry"],
            "type": "theme",
            "category": "theme",
            "description": "The default theme of Foundry VTT seamlessly blends simplicity with functionality, creating an intuitive platform where epic adventures unfold."
        },  
        {
            "name": "Dark And Stormy",
            "id": "theme-dark",
            "constantname": "THEMEDARK",
            "path": "cardsdark",
            "tags": ["theme", "dark", "stormy", "atmospheric"],
            "type": "theme",
            "category": "theme",
            "description": "This dark theme envelops your tabletop in a brooding atmosphere where shadows dance and lightning crackles, creating the perfect backdrop for mysterious adventures."
        },
        {
            "name": "Blue Velvet",
            "id": "theme-blue",
            "constantname": "THEMEBLUE",
            "path": "cardsblue",
            "tags": ["theme", "blue", "velvet", "elegant"],
            "type": "theme",
            "category": "theme",
            "description": "Immerse yourself in a realm of noble elegance where deep blues and rich details create an atmosphere of majestic sophistication."
        },
        {
            "name": "Red Wine",
            "id": "theme-red",
            "constantname": "THEMERED",
            "path": "cardsred",
            "tags": ["theme", "red", "wine", "luxury"],
            "type": "theme",
            "category": "theme",
            "description": "Savor the bold elegance of this wine-inspired theme, where rich crimson hues create an atmosphere of sophisticated luxury."
        },
        {
            "name": "Green Moss",
            "id": "theme-green",
            "constantname": "THEMEGREEN",
            "path": "cardsgreen",
            "tags": ["theme", "green", "moss", "nature"],
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
            "id": "background-brick",
            "constantname": "BACKBRICK",
            "path": "modules/coffee-pub-blacksmith/images/tiles/brick.webp",
            "tags": ["background", "brick", "stone", "texture"],
            "type": "image",
            "category": "tile"
        },  
        {
            "name": "Dessert",
            "id": "background-dessert",
            "constantname": "BACKDESSERT",
            "path": "modules/coffee-pub-blacksmith/images/tiles/dessert.webp",
            "tags": ["background", "dessert", "sand", "arid"],
            "type": "image",
            "category": "tile"
        }, 
        {
            "name": "Dirt",
            "id": "background-dirt",
            "constantname": "BACKDIRT",
            "path": "modules/coffee-pub-blacksmith/images/tiles/dirt.webp",
            "tags": ["background", "dirt", "earth", "soil"],
            "type": "image",
            "category": "tile"
        }, 
        {
            "name": "Grass",
            "id": "background-grass",
            "constantname": "BACKGRASS",
            "path": "modules/coffee-pub-blacksmith/images/tiles/grass.webp",
            "tags": ["background", "grass", "nature", "green"],
            "type": "image",
            "category": "tile"
        }, 
        {
            "name": "Rock",
            "id": "background-rock",
            "constantname": "BACKROCK",
            "path": "modules/coffee-pub-blacksmith/images/tiles/rock.webp",
            "tags": ["background", "rock", "stone", "mountain"],
            "type": "image",
            "category": "tile"
        }, 
        {
            "name": "Stone",
            "id": "background-stone",
            "constantname": "BACKSTONE",
            "path": "modules/coffee-pub-blacksmith/images/tiles/stone.webp",
            "tags": ["background", "stone", "masonry", "building"],
            "type": "image",
            "category": "tile"
        }, 
        {
            "name": "Cobblestone",
            "id": "background-cobblestone",
            "constantname": "BACKCOBBLESTONE",
            "path": "modules/coffee-pub-blacksmith/images/tiles/cobblestone.webp",
            "tags": ["background", "cobblestone", "road", "path"],
            "type": "image",
            "category": "tile"
        }, 
        {
            "name": "Stone Floor",
            "id": "background-stonefloor",
            "constantname": "BACKSTONEFLOOR",
            "path": "modules/coffee-pub-blacksmith/images/tiles/stonefloor.webp",
            "tags": ["background", "stonefloor", "floor", "interior"],
            "type": "image",
            "category": "tile"
        }, 

        {
            "name": "Parchment",
            "id": "background-parchment",
            "constantname": "BACKPARCHMENT",
            "path": "modules/coffee-pub-blacksmith/images/tiles/parchment.webp",
            "tags": ["background", "parchment", "paper", "document"],
            "type": "image",
            "category": "tile"
        },

        {
            "name": "Light Cloth",
            "id": "background-clothlight",
            "constantname": "BACKCLOTHLIGHT",
            "path": "modules/coffee-pub-blacksmith/images/tiles/clothlight.webp",
            "tags": ["background", "clothlight", "fabric", "light"],
            "type": "image",
            "category": "tile"
        },

        {
            "name": "Dark Cloth",
            "id": "background-clothdark",
            "constantname": "BACKCLOTHDARK",
            "path": "modules/coffee-pub-blacksmith/images/tiles/clothdark.webp",
            "tags": ["background", "clothdark", "fabric", "dark"],
            "type": "image",
            "category": "tile"
        },


    ]
};
// Icons
export const dataIcons = {
    "icons": [
        {
            "name": "No Icon (Select One)",
            "id": "icon-none",
            "constantname": "ICONNONE",
            "path": "",
            "tags": ["icon", "none", "empty"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Chess: Queen",
            "id": "icon-chess-queen",
            "constantname": "ICONCHESSQUEEN",
            "path": "fa-chess-queen",
            "tags": ["icon", "chess", "queen", "royalty"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Chess: King",
            "id": "icon-chess-king",
            "constantname": "ICONCHESSKING",
            "path": "fa-chess-king",
            "tags": ["icon", "chess", "king", "royalty"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Chess: Rook",
            "id": "icon-chess-rook",
            "constantname": "ICONCHESSROOK",
            "path": "fa-chess-rook",
            "tags": ["icon", "chess", "rook", "castle"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Fist",
            "id": "icon-fist",
            "constantname": "ICONFIST",
            "path": "fa-hand-fist",
            "tags": ["icon", "fist", "hand", "combat"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Paw",
            "id": "icon-paw",
            "constantname": "ICONPAW",
            "path": "fa-paw",
            "tags": ["icon", "paw", "animal", "beast"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Shield",
            "id": "icon-shield",
            "constantname": "ICONSHIELD",
            "path": "fa-shield",
            "tags": ["icon", "shield", "defense", "protection"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Skull",
            "id": "icon-skull",
            "constantname": "ICONSKULL",
            "path": "fa-skull",
            "tags": ["icon", "skull", "death", "danger"],
            "type": "icon",
            "category": "interface"
        },
        {
            "name": "Coffee Pot",
            "id": "icon-coffee-pot",
            "constantname": "ICONCOFFEEPOT",
            "path": "fa-coffee-pot",
            "tags": ["icon", "coffee", "pot", "beverage"],
            "type": "icon",
            "category": "interface"
        },
    ]
};


// Nameplates
export const dataNameplate = {
    "names": [
        {
            "name": "Do Not Change Token Names",
            "id": "nameplate-none",
            "constantname": "NAMEPLATENONE",
            "path": "",
            "tags": ["nameplate", "none", "default"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Replace Token with Name",
            "id": "nameplate-replace",
            "constantname": "NAMEPLATEREPLACE",
            "path": "",
            "tags": ["nameplate", "replace", "token"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Name: Token Name",
            "id": "nameplate-append-end",
            "constantname": "NAMEPLATEAPPENDEND",
            "path": "",
            "tags": ["nameplate", "append", "end", "token"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Name: Name Token",
            "id": "nameplate-append-start",
            "constantname": "NAMEPLATEAPPENDSTART",
            "path": "",
            "tags": ["nameplate", "append", "start", "name"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Name: Token (Name)",
            "id": "nameplate-append-end-parenthesis",
            "constantname": "NAMEPLATEAPPENDENDPARENTHESIS",
            "path": "",
            "tags": ["nameplate", "append", "end", "parenthesis", "token"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Name: Name (Token)",
            "id": "nameplate-append-start-parenthesis",
            "constantname": "NAMEPLATEAPPENDSTARTPARENTHESIS",
            "path": "",
            "tags": ["nameplate", "append", "start", "parenthesis", "name"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Name: Token - Name",
            "id": "nameplate-append-end-dash",
            "constantname": "NAMEPLATEAPPENDENDDASH",
            "path": "",
            "tags": ["nameplate", "append", "end", "dash", "token"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Name: Name - Token",
            "id": "nameplate-append-start-dash",
            "constantname": "NAMEPLATEAPPENDSTARTDASH",
            "path": "",
            "tags": ["nameplate", "append", "start", "dash", "name"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Number: Token 01",
            "id": "nameplate-number-append-end",
            "constantname": "NAMEPLATENUMBERAPPENDEND",
            "path": "",
            "tags": ["nameplate", "number", "append", "end", "token"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Number: Token (01)",
            "id": "nameplate-number-append-end-parenthesis",
            "constantname": "NAMEPLATENUMBERAPPENDENDPARENTHESIS",
            "path": "",
            "tags": ["nameplate", "number", "append", "end", "parenthesis", "token"],
            "type": "nameplate",
            "category": "interface"
        },
        {
            "name": "Append Number: Token - 01",
            "id": "nameplate-number-append-end-dash",
            "constantname": "NAMEPLATENUMBERAPPENDENDDASH",
            "path": "",
            "tags": ["nameplate", "number", "append", "end", "dash", "token"],
            "type": "nameplate",
            "category": "interface"
        }
    ]
};

// Sounds modules/coffee-pub-blacksmith/sounds/clatter.mp3
export const dataSounds = {
    "sounds": [
        {
            "name": "No Sound",
            "id": "sound-none",
            "constantname": "SOUNDNONE",
            "path": "",
            "tags": ["sound", "none", "silent"],
            "type": "sound",
            "category": "effects"
        },

        // General Sounds
        {
            "name": "General: Arrow",
            "id": "sound-arrow",
            "constantname": "SOUNDARROW",
            "path": "modules/coffee-pub-blacksmith/sounds/arrow.mp3",
            "tags": ["sound", "arrow", "projectile", "combat"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Battlecry",
            "id": "sound-battlecry",
            "constantname": "SOUNDBATTLECRY",
            "path": "modules/coffee-pub-blacksmith/sounds/battlecry.mp3",
            "tags": ["sound", "battlecry", "combat", "war"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Bell",
            "id": "sound-bell",
            "constantname": "SOUNDBELL",
            "path": "modules/coffee-pub-blacksmith/sounds/bell.mp3",
            "tags": ["sound", "bell", "notification", "alert"],
            "type": "sound",
            "category": "effects"
        },



        {
            "name": "General: Gong",
            "id": "sound-gong",
            "constantname": "SOUNDGONG",
            "path": "modules/coffee-pub-blacksmith/sounds/gong.mp3",
            "tags": ["sound", "gong", "bell", "ceremony"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Greataxe",
            "id": "sound-greataxe",
            "constantname": "SOUNDGREATAXE",
            "path": "modules/coffee-pub-blacksmith/sounds/greataxe.mp3",
            "tags": ["sound", "greataxe", "weapon", "combat"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Notification",
            "id": "sound-notification",
            "constantname": "SOUNDNOTIFICATION",
            "path": "modules/coffee-pub-blacksmith/sounds/notification.mp3",
            "tags": ["sound", "notification", "alert", "info"],
            "type": "sound",
            "category": "effects"
        },



        // Interface Sounds
        {
            "name": "Interface: Button 01",
            "id": "sound-interface-button-01",
            "constantname": "SOUNDBUTTON01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-01.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 02",
            "id": "sound-interface-button-02",
            "constantname": "SOUNDBUTTON02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-02.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 03",
            "id": "sound-interface-button-03",
            "constantname": "SOUNDBUTTON03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-03.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 04",
            "id": "sound-interface-button-04",
            "constantname": "SOUNDBUTTON04",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-04.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 05",
            "id": "sound-interface-button-05",
            "constantname": "SOUNDBUTTON05",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-05.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 06",
            "id": "sound-interface-button-06",
            "constantname": "SOUNDBUTTON06",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-06.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 07",
            "id": "sound-interface-button-07",
            "constantname": "SOUNDBUTTON07",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-07.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 08",
            "id": "sound-interface-button-08",
            "constantname": "SOUNDBUTTON08",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-08.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 09",
            "id": "sound-interface-button-09",
            "constantname": "SOUNDBUTTON09",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 10",
            "id": "sound-interface-button-10",
            "constantname": "SOUNDBUTTON10",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-10.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 11",
            "id": "sound-interface-button-11",
            "constantname": "SOUNDBUTTON11",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-11.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Button 12",
            "id": "sound-interface-button-12",
            "constantname": "SOUNDBUTTON12",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-button-12.mp3",
            "tags": ["sound", "interface", "button", "click", "ui"],
            "type": "sound",
            "category": "interface"
        },

        // Interface Errors
        {
            "name": "Interface: Error 01",
            "id": "sound-interface-error-01",
            "constantname": "SOUNDERROR01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-01.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 02",
            "id": "sound-interface-error-02",
            "constantname": "SOUNDERROR02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-02.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 03",
            "id": "sound-interface-error-03",
            "constantname": "SOUNDERROR03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-03.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 04",
            "id": "sound-interface-error-04",
            "constantname": "SOUNDERROR04",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-04.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 05",
            "id": "sound-interface-error-05",
            "constantname": "SOUNDERROR05",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-05.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 06",
            "id": "sound-interface-error-06",
            "constantname": "SOUNDERROR06",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-06.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 07",
            "id": "sound-interface-error-07",
            "constantname": "SOUNDERROR07",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-07.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 08",
            "id": "sound-interface-error-08",
            "constantname": "SOUNDERROR08",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-08.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 09",
            "id": "sound-interface-error-09",
            "constantname": "SOUNDERROR09",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-09.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 10",
            "id": "sound-interface-error-10",
            "constantname": "SOUNDERROR10",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-10.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Error 11",
            "id": "sound-interface-error-11",
            "constantname": "SOUNDERROR11",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-error-11.mp3",
            "tags": ["sound", "interface", "error", "alert", "warning"],
            "type": "sound",
            "category": "interface"
        },

        // Interface Notifications
        {
            "name": "Interface: Notification 01",
            "id": "sound-interface-notification-01",
            "constantname": "SOUNDNOTIFICATION01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 02",
            "id": "sound-interface-notification-02",
            "constantname": "SOUNDNOTIFICATION02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-02.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 03",
            "id": "sound-interface-notification-03",
            "constantname": "SOUNDNOTIFICATION03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-03.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 04",
            "id": "sound-interface-notification-04",
            "constantname": "SOUNDNOTIFICATION04",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-04.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 05",
            "id": "sound-interface-notification-05",
            "constantname": "SOUNDNOTIFICATION05",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-05.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 06",
            "id": "sound-interface-notification-06",
            "constantname": "SOUNDNOTIFICATION06",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-06.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 07",
            "id": "sound-interface-notification-07",
            "constantname": "SOUNDNOTIFICATION07",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-07.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 08",
            "id": "sound-interface-notification-08",
            "constantname": "SOUNDNOTIFICATION08",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-08.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 09",
            "id": "sound-interface-notification-09",
            "constantname": "SOUNDNOTIFICATION09",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-09.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 10",
            "id": "sound-interface-notification-10",
            "constantname": "SOUNDNOTIFICATION10",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-10.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 11",
            "id": "sound-interface-notification-11",
            "constantname": "SOUNDNOTIFICATION11",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-11.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 12",
            "id": "sound-interface-notification-12",
            "constantname": "SOUNDNOTIFICATION12",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-12.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 13",
            "id": "sound-interface-notification-13",
            "constantname": "SOUNDNOTIFICATION13",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-13.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 14",
            "id": "sound-interface-notification-14",
            "constantname": "SOUNDNOTIFICATION14",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-14.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Notification 15",
            "id": "sound-interface-notification-15",
            "constantname": "SOUNDNOTIFICATION15",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-15.mp3",
            "tags": ["sound", "interface", "notification", "alert", "info"],
            "type": "sound",
            "category": "interface"
        },

        // Interface Other
        {
            "name": "Interface: Open 01",
            "id": "sound-interface-open-01",
            "constantname": "SOUNDDEFAULTFILE",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-open-01.mp3",
            "tags": ["sound", "interface", "open", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Ping 01",
            "id": "sound-interface-ping-01",
            "constantname": "SOUNDPING01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-ping-01.mp3",
            "tags": ["sound", "interface", "ping", "alert"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Pop 01",
            "id": "sound-interface-pop-01",
            "constantname": "SOUNDPOP01",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3",
            "tags": ["sound", "interface", "pop", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Pop 02",
            "id": "sound-interface-pop-02",
            "constantname": "SOUNDPOP02",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3",
            "tags": ["sound", "interface", "pop", "ui"],
            "type": "sound",
            "category": "interface"
        },
        {
            "name": "Interface: Pop 03",
            "id": "sound-interface-pop-03",
            "constantname": "SOUNDPOP03",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-pop-03.mp3",
            "tags": ["sound", "interface", "pop", "ui"],
            "type": "sound",
            "category": "interface"
        },


        // Books
        {
            "name": "Book: Flip 01",
            "id": "sound-book-flip-01",
            "constantname": "SOUNDEFFECTBOOK01",
            "path": "modules/coffee-pub-blacksmith/sounds/book-flip-01.mp3",
            "tags": ["sound", "effect", "book", "flip", "page"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Book: Flip 02",
            "id": "sound-book-flip-02",
            "constantname": "SOUNDEFFECTBOOK02",
            "path": "modules/coffee-pub-blacksmith/sounds/book-flip-02.mp3",
            "tags": ["sound", "effect", "book", "flip", "page"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Book: Open 02",
            "id": "sound-book-open-02",
            "constantname": "SOUNDEFFECTBOOK03",
            "path": "modules/coffee-pub-blacksmith/sounds/book-open-02.mp3",
            "tags": ["sound", "effect", "book", "open", "cover"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Book: Take 01",
            "id": "sound-book-take-01",
            "constantname": "SOUNDEFFECTBOOK04",
            "path": "modules/coffee-pub-blacksmith/sounds/book-take-01.mp3",
            "tags": ["sound", "effect", "book", "take", "grab"],
            "type": "sound",
            "category": "effects"
        },

        // Chest and Items
        {
            "name": "Chest: Open",
            "id": "sound-chest-open",
            "constantname": "SOUNDEFFECTCHEST01",
            "path": "modules/coffee-pub-blacksmith/sounds/chest-open.mp3",
            "tags": ["sound", "effect", "chest", "open", "lid"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Chest: Treasure",
            "id": "sound-chest-treasure",
            "constantname": "SOUNDEFFECTCHEST02",
            "path": "modules/coffee-pub-blacksmith/sounds/chest-treasure.mp3",
            "tags": ["sound", "effect", "chest", "treasure", "loot"],
            "type": "sound",
            "category": "effects"
        },

        // Effects and Magic
        {
            "name": "Effect: Sad Trombone",
            "id": "sound-effect-sad-trombone",
            "constantname": "SOUNDSADTROMBONE",
            "path": "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
            "tags": ["sound", "effect", "sad", "trombone", "comedy"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Magic: Spell Magic Circle",
            "id": "sound-magic-spell-circle",
            "constantname": "SOUNDSPELLMAGICCIRCLE",
            "path": "modules/coffee-pub-blacksmith/sounds/spell-magic-circle.mp3",
            "tags": ["sound", "magic", "spell", "circle", "enchantment"],
            "type": "sound",
            "category": "magic"
        },



        // Reactions
        {
            "name": "Reaction: Ahhhhh",
            "id": "modules/coffee-pub-blacksmith/sounds/reaction-ahhhhh.mp3",
            "constantname": "SOUNDREACTIONAHHHH",
            "path": "modules/coffee-pub-blacksmith/sounds/reaction-ahhhhh.mp3",
            "tags": ["reaction", "ahhhh"],
            "type": "sound",
            "category": "reaction"
        },
        {
            "name": "Reaction: Oooooh",
            "id": "modules/coffee-pub-blacksmith/sounds/reaction-oooooh.mp3",
            "constantname": "SOUNDREACTIONOOOOOH",
            "path": "modules/coffee-pub-blacksmith/sounds/reaction-oooooh.mp3",
            "tags": ["reaction", "oooooh"],
            "type": "sound",
            "category": "reaction"
        },
        {
            "name": "Reaction: Yay",
            "id": "modules/coffee-pub-blacksmith/sounds/reaction-yay.mp3",
            "constantname": "SOUNDREACTIONYAY",
            "path": "modules/coffee-pub-blacksmith/sounds/reaction-yay.mp3",
            "tags": ["reaction", "yay"],
            "type": "sound",
            "category": "reaction"
        },

        // Weapons
        {
            "name": "Weapon: Sword Blade Swish",
            "id": "modules/coffee-pub-blacksmith/sounds/weapon-sword-blade-swish.mp3",
            "constantname": "SOUNDEFFECTWEAPON01",
            "path": "modules/coffee-pub-blacksmith/sounds/weapon-sword-blade-swish.mp3",
            "tags": ["weapon", "sword", "swish"],
            "type": "sound",
            "category": "weapon"
        },
        {
            "name": "Weapon: Greataxe",
            "id": "modules/coffee-pub-blacksmith/sounds/greataxe.mp3",
            "constantname": "SOUNDEFFECTWEAPON02",
            "path": "modules/coffee-pub-blacksmith/sounds/greataxe.mp3",
            "tags": ["weapon", "greataxe"],
            "type": "sound",
            "category": "weapon"
        },
        {
            "name": "Weapon: Arrow",
            "id": "modules/coffee-pub-blacksmith/sounds/arrow.mp3",
            "constantname": "SOUNDEFFECTWEAPON03",
            "path": "modules/coffee-pub-blacksmith/sounds/arrow.mp3",
            "tags": ["weapon", "arrow"],
            "type": "sound",
            "category": "weapon"
        },

        // Instruments
        {
            "name": "Instrument: Sad Trombone",
            "id": "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT01",
            "path": "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
            "tags": ["instrument", "sad", "trombone"],
            "type": "sound",
            "category": "instrument"
        },
        {
            "name": "Instrument: Fanfare Harp",
            "id": "modules/coffee-pub-blacksmith/sounds/fanfare-harp.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT02",
            "path": "modules/coffee-pub-blacksmith/sounds/fanfare-harp.mp3",
            "tags": ["instrument", "fanfare", "harp"],
            "type": "sound",
            "category": "instrument"
        },
        {
            "name": "Instrument: Bell",
            "id": "modules/coffee-pub-blacksmith/sounds/bell.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT03",
            "path": "modules/coffee-pub-blacksmith/sounds/bell.mp3",
            "tags": ["instrument", "bell"],
            "type": "sound",
            "category": "instrument"
        },
        {
            "name": "Instrument: Gong",
            "id": "modules/coffee-pub-blacksmith/sounds/gong.mp3",
            "constantname": "SOUNDEFFECTINSTRUMENT04",
            "path": "modules/coffee-pub-blacksmith/sounds/gong.mp3",
            "tags": ["instrument", "gong"],
            "type": "sound",
            "category": "instrument"
        },

        // General Effects
        {
            "name": "General: Rustling Grass",
            "id": "modules/coffee-pub-blacksmith/sounds/rustling-grass.mp3",
            "constantname": "SOUNDEFFECTGENERAL01",
            "path": "modules/coffee-pub-blacksmith/sounds/rustling-grass.mp3",
            "tags": ["general", "grass", "rustling"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Synth",
            "id": "sound-general-synth",
            "constantname": "SOUNDEFFECTGENERAL03",
            "path": "modules/coffee-pub-blacksmith/sounds/synth.mp3",
            "tags": ["sound", "general", "synth", "electronic"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Spell Magic Circle",
            "id": "sound-general-spell-circle",
            "constantname": "SOUNDEFFECTGENERAL02",
            "path": "modules/coffee-pub-blacksmith/sounds/spell-magic-circle.mp3",
            "tags": ["sound", "general", "spell", "magic", "circle"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Charm",
            "id": "sound-general-charm",
            "constantname": "SOUNDEFFECTGENERAL05",
            "path": "modules/coffee-pub-blacksmith/sounds/charm.mp3",
            "tags": ["sound", "general", "charm", "enchantment"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Clatter",
            "id": "sound-general-clatter",
            "constantname": "SOUNDEFFECTGENERAL06",
            "path": "modules/coffee-pub-blacksmith/sounds/clatter.mp3",
            "tags": ["sound", "general", "clatter", "noise"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Cocktail Ice",
            "id": "sound-general-cocktail-ice",
            "constantname": "SOUNDEFFECTGENERAL08",
            "path": "modules/coffee-pub-blacksmith/sounds/general-cocktail-ice.mp3",
            "tags": ["sound", "general", "cocktail", "ice", "beverage"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "General: Toilet Flush",
            "id": "sound-general-toilet-flush",
            "constantname": "SOUNDEFFECTGENERAL09",
            "path": "modules/coffee-pub-blacksmith/sounds/general-toilet-flush.mp3",
            "tags": ["sound", "general", "toilet", "flush", "bathroom"],
            "type": "sound",
            "category": "effects"
        },

        // Battle Cry
        {
            "name": "Battle Cry",
            "id": "sound-battle-cry",
            "constantname": "SOUNDEFFECTREACTION04",
            "path": "modules/coffee-pub-blacksmith/sounds/battlecry.mp3",
            "tags": ["sound", "reaction", "battle", "cry", "combat"],
            "type": "sound",
            "category": "one-shots"
        },

        // Skill Check Specific Sounds
        {
            "name": "Cinematic: Open",
            "id": "sound-cinematic-open",
            "constantname": "SOUNDCINEMATICOPEN",
            "path": "modules/coffee-pub-blacksmith/sounds/fanfare-intro-1.mp3",
            "tags": ["sound", "cinematic", "open", "fanfare", "intro"],
            "type": "sound",
            "category": "soundtrack"
        },
        {
            "name": "Dice: Rolling",
            "id": "sound-dice-rolling",
            "constantname": "SOUNDDICEROLL",
            "path": "modules/coffee-pub-blacksmith/sounds/general-dice-rolling.mp3",
            "tags": ["sound", "dice", "rolling", "game"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Success: Fanfare",
            "id": "sound-success-fanfare",
            "constantname": "SOUNDSUCCESS",
            "path": "modules/coffee-pub-blacksmith/sounds/fanfare-success-2.mp3",
            "tags": ["sound", "success", "fanfare", "victory"],
            "type": "sound",
            "category": "soundtrack"
        },
        {
            "name": "Failure: Fanfare",
            "id": "sound-failure-fanfare",
            "constantname": "SOUNDFAILURE",
            "path": "modules/coffee-pub-blacksmith/sounds/fanfare-failure-1.mp3",
            "tags": ["sound", "failure", "fanfare", "defeat"],
            "type": "sound",
            "category": "soundtrack"
        },
        {
            "name": "Versus: Fanfare",
            "id": "sound-versus-fanfare",
            "constantname": "SOUNDVERSUS",
            "path": "modules/coffee-pub-blacksmith/sounds/fanfare-intro-2.mp3",
            "tags": ["sound", "versus", "fanfare", "confrontation"],
            "type": "sound",
            "category": "soundtrack"
        },
        {
            "name": "Roll: Complete",
            "id": "sound-roll-complete",
            "constantname": "SOUNDROLLCOMPLETE",
            "path": "modules/coffee-pub-blacksmith/sounds/interface-notification-03.mp3",
            "tags": ["sound", "roll", "complete", "notification"],
            "type": "sound",
            "category": "effects"
        },
        {
            "name": "Roll: Critical",
            "id": "sound-roll-critical",
            "constantname": "SOUNDROLLCRITICAL",
            "path": "modules/coffee-pub-blacksmith/sounds/fanfare-success-1.mp3",
            "tags": ["sound", "roll", "critical", "success"],
            "type": "sound",
            "category": "soundtrack"
        },
        {
            "name": "Roll: Fumble",
            "id": "sound-roll-fumble",
            "constantname": "SOUNDROLLFUMBLE",
            "path": "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
            "tags": ["sound", "roll", "fumble", "sad", "comedy"],
            "type": "sound",
            "category": "effects"
        }
    ]
};

// VOLUME CONSTANTS
export const dataVolume = {
    "volumes": [
        {
            "name": "Loud",
            "id": "volume-loud",
            "constantname": "SOUNDVOLUMELOUD",
            "path": "0.8",
            "tags": ["volume", "loud", "dramatic"],
            "type": "volume",
            "category": "setting",
            "description": "Loud volume level for dramatic effects"
        },
        {
            "name": "Normal",
            "id": "volume-normal",
            "constantname": "SOUNDVOLUMENORMAL", 
            "path": "0.5",
            "tags": ["volume", "normal", "standard"],
            "type": "volume",
            "category": "setting",
            "description": "Standard volume level for most sounds"
        },
        {
            "name": "Soft",
            "id": "volume-soft",
            "constantname": "SOUNDVOLUMESOFT",
            "path": "0.3",
            "tags": ["volume", "soft", "subtle"],
            "type": "volume",
            "category": "setting",
            "description": "Soft volume level for subtle effects"
        },
        {
            "name": "Max",
            "id": "volume-max",
            "constantname": "SOUNDVOLUMEMAX",
            "path": "1.0",
            "tags": ["volume", "max", "maximum"],
            "type": "volume",
            "category": "setting",
            "description": "Maximum volume level"
        }
    ]
};

// BANNER IMAGES
export const dataBanners = {
    "banners": [
        // Hero Banners
        {
            "name": "Heroes 01",
            "id": "banner-heroes-01",
            "constantname": "BANNERHEROES01",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-heros-1.webp",
            "tags": ["banner", "heroes", "player", "character"],
            "type": "image",
            "category": "banner",
            "description": "Heroic banner for player characters"
        },
        {
            "name": "Heroes 02", 
            "id": "banner-heroes-02",
            "constantname": "BANNERHEROES02",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-heros-2.webp",
            "tags": ["banner", "heroes", "player", "character"],
            "type": "image",
            "category": "banner",
            "description": "Heroic banner for player characters"
        },
        {
            "name": "Heroes 03",
            "id": "banner-heroes-03",
            "constantname": "BANNERHEROES03",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-heros-3.webp", 
            "tags": ["banner", "heroes", "player", "character"],
            "type": "image",
            "category": "banner",
            "description": "Heroic banner for player characters"
        },
        {
            "name": "Narration: Crypt 01",
            "id": "banner-narration-crypt-01",
            "constantname": "BANNERHEROES04",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-1.webp",
            "tags": ["banner", "narration", "crypt", "underground"],
            "type": "image",
            "category": "banner",
            "description": "Crypt narration banner"
        },
        {
            "name": "Narration: Crypt 02",
            "id": "banner-narration-crypt-02",
            "constantname": "BANNERHEROES05",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-2.webp",
            "tags": ["banner", "narration", "crypt", "underground"],
            "type": "image",
            "category": "banner",
            "description": "Crypt narration banner"
        },
        {
            "name": "Narration: Forest 01",
            "id": "banner-narration-forest-01",
            "constantname": "BANNERHEROES06",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-1.webp",
            "tags": ["banner", "narration", "forest", "nature"],
            "type": "image",
            "category": "banner",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Forest 02",
            "id": "banner-narration-forest-02",
            "constantname": "BANNERHEROES07",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-2.webp",
            "tags": ["banner", "narration", "forest", "nature"],
            "type": "image",
            "category": "banner",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Forest 03",
            "id": "banner-narration-forest-03",
            "constantname": "BANNERHEROES08",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-3.webp",
            "tags": ["banner", "narration", "forest", "nature"],
            "type": "image",
            "category": "banner",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Forest 04",
            "id": "banner-narration-forest-04",
            "constantname": "BANNERHEROES09",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-4.webp",
            "tags": ["banner", "narration", "forest", "nature"],
            "type": "image",
            "category": "banner",
            "description": "Forest narration banner"
        },
        {
            "name": "Narration: Jungle 01",
            "id": "banner-narration-jungle-01",
            "constantname": "BANNERHEROES10",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-narration-jungle-1.webp",
            "tags": ["banner", "narration", "jungle", "tropical"],
            "type": "image",
            "category": "banner",
            "description": "Jungle narration banner"
        },

        // Monster Banners
        {
            "name": "Dragon",
            "id": "banner-monster-dragon",
            "constantname": "BANNERMONSTER01",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-dragon.webp",
            "tags": ["banner", "monster", "dragon", "beast"],
            "type": "image",
            "category": "banner",
            "description": "Dragon monster banner"
        },
        {
            "name": "Minotaur",
            "id": "banner-monster-minotaur",
            "constantname": "BANNERMONSTER02",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-minotaur.webp",
            "tags": ["banner", "monster", "minotaur", "beast"],
            "type": "image",
            "category": "banner",
            "description": "Minotaur monster banner"
        },
        {
            "name": "Wraith 01",
            "id": "banner-monster-wraith-01",
            "constantname": "BANNERMONSTER03",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-wraith-1.webp",
            "tags": ["banner", "monster", "wraith", "undead"],
            "type": "image",
            "category": "banner",
            "description": "Wraith monster banner"
        },
        {
            "name": "Wraith 02",
            "id": "banner-monster-wraith-02",
            "constantname": "BANNERMONSTER04",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-wraith-2.webp",
            "tags": ["banner", "monster", "wraith", "undead"],
            "type": "image",
            "category": "banner",
            "description": "Wraith monster banner"
        },

        // Landscape Banners
        {
            "name": "Landscape: Winter 01",
            "id": "banner-landscape-winter-01",
            "constantname": "BANNERLANDSCAPE01",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-1.webp",
            "tags": ["banner", "landscape", "winter", "snow"],
            "type": "image",
            "category": "banner",
            "description": "Winter landscape banner"
        },
        {
            "name": "Landscape: Winter 02",
            "id": "banner-landscape-winter-02",
            "constantname": "BANNERLANDSCAPE02",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-2.webp",
            "tags": ["banner", "landscape", "winter", "snow"],
            "type": "image",
            "category": "banner",
            "description": "Winter landscape banner"
        }
    ]
};

// BACKGROUND IMAGES FOR SKILL CHECKS
export const dataBackgrounds = {
    "backgrounds": [
        {
            "name": "Skill Check Background",
            "id": "background-skill-check",
            "constantname": "BACKSKILLCHECK",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp",
            "tags": ["background", "skill-check", "radiant"],
            "type": "image",
            "category": "background"
        },
        {
            "name": "Ability Check Background",
            "id": "background-ability-check",
            "constantname": "BACKABILITYCHECK",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-3.webp",
            "tags": ["background", "ability-check", "cold"],
            "type": "image",
            "category": "background"
        },
        {
            "name": "Saving Throw Background",
            "id": "background-saving-throw",
            "constantname": "BACKSAVINGTHROW",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-4.webp",
            "tags": ["background", "saving-throw", "bludgeoning"],
            "type": "image",
            "category": "background"
        },
        {
            "name": "Dice Roll Background",
            "id": "background-dice-roll",
            "constantname": "BACKDICEROLL",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-2.webp",
            "tags": ["background", "skill-check", "dice-roll", "psychic"],
            "type": "image",
            "category": "background"
        },
        {
            "name": "Tool Check Background",
            "id": "background-tool-check",
            "constantname": "BACKTOOLCHECK",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-3.webp",
            "tags": ["background", "tool-check", "poison"],
            "type": "image",
            "category": "background"
        },
        {
            "name": "Contested Roll Background",
            "id": "background-contested-roll",
            "constantname": "BACKCONTESTEDROLL",
            "path": "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-6.webp",
            "tags": ["background", "contested-roll", "fire"],
            "type": "image",
            "category": "background"
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
