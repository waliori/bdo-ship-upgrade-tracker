# BDO Ship Upgrade Tracker - Global Inventory System

## Overview

The new Global Inventory System provides a comprehensive, grid-based interface for managing all materials across your BDO ship upgrade projects. It mimics the look and feel of the in-game inventory while providing advanced filtering, categorization, and project integration features.

## Features

### 🎒 **Grid-Based Interface**
- **BDO-like Grid**: Items displayed in a familiar 80x80px grid layout similar to the game
- **Item Icons**: All 396+ items with their official BDO icons
- **Quantity Displays**: Shows owned quantities with visual indicators
- **Status Indicators**: Visual cues for owned, needed, partial completion, and fully complete items

### 📊 **Smart Categorization**
Items are automatically categorized into 6 logical groups:

1. **⛵ Ships** - Actual ship types and variants
2. **⚙️ Ship Parts** - Cannons, sails, plating, figureheads, upgrade permits
3. **🔨 Materials** - Raw materials, ingots, timber, fabrics, processed goods
4. **💰 Barter Items** - Items specifically used in the bartering system
5. **💎 Currencies** - Coins, gold bars, special currencies
6. **📜 Special** - Blueprints and unique crafting items

**Note**: Non-inventory items such as quests, NPCs, and sea monsters are automatically excluded as they are not physical items that can be owned or stored.

### 🔍 **Advanced Filtering & Search**
- **Real-time Search**: Instant filtering as you type
- **Category Tabs**: Quick filtering by item type with item counts
- **Status Filters**: Show only owned items, needed items, or both
- **Sort Options**: Sort by name, category, quantity, or needed amount
- **View Modes**: Switch between grid view and detailed list view

### 🔗 **Project Integration**
- **Cross-Project Tracking**: See which projects need each item
- **Completion Progress**: Visual progress indicators for each material
- **Real-time Updates**: Automatically syncs with your active ship projects
- **Barter Integration**: Shows which items can be obtained through bartering

### 💾 **Persistent Storage**
- **Auto-save**: All quantities and settings saved automatically
- **Multi-tab Sync**: Changes sync across browser tabs in real-time
- **Import/Export**: Backup and restore your inventory data
- **Settings Memory**: Remembers your preferred filters, view mode, and sort order

## How to Use

### Opening the Inventory
1. Click the **🌐 Cross-Craft** button in the main dashboard
2. The inventory modal will open showing all items categorized and organized

### Managing Item Quantities
1. **View Items**: Browse through categories or search for specific items
2. **Edit Quantities**: Click any item to open the quantity editor
3. **Quick Actions**: Use +/- buttons or set specific amounts
4. **Bulk Operations**: Import/export data for bulk updates

### Understanding Item Status
- **Green Border**: You own this item
- **Orange Border**: This item is needed for active projects
- **Blue Border**: Partially complete (you have some but need more)
- **Green Glow**: Fully complete (you have enough for all projects)
- **Checkmark Badge**: Material requirement fully satisfied

### Tooltips & Information
Hover over any item to see:
- Item name and category
- Current owned quantity
- Amount needed for active projects
- Progress percentage
- Which projects use this item
- Whether it can be obtained through barter

### Filtering & Organization
- **Category Tabs**: Click category icons to filter by type
- **Search Bar**: Type to find specific items instantly
- **Filter Buttons**: Toggle to show only owned or needed items
- **Sort Dropdown**: Change how items are ordered
- **View Toggle**: Switch between grid and list layouts

## Technical Integration

### Data Synchronization
The inventory system automatically syncs with:
- **Global Inventory Manager**: The existing material tracking system
- **Active Projects**: Currently selected ships and their requirements
- **Barter System**: Available trading opportunities
- **Local Storage**: Persistent data across browser sessions

### Performance Features
- **Lazy Loading**: Icons loaded as needed for smooth performance
- **Memory Caching**: Frequently accessed data cached in memory
- **Debounced Updates**: Smooth UI updates without lag
- **Cross-tab Sync**: Real-time updates when data changes in other tabs

### Responsive Design
- **Mobile Optimized**: Adapts to smaller screens with adjusted grid sizes
- **Touch Friendly**: Large touch targets for mobile devices
- **Keyboard Navigation**: Full keyboard support for accessibility

## File Structure

```
js/
├── inventory-system.js    # Core inventory management logic
├── inventory-ui.js        # UI components and interactions
└── app.js                # Integration with existing app

css/
└── inventory-system.css   # Complete styling for inventory interface

icon_mapping.json          # Item data with icons and categories
```

## Getting Started

The inventory system is automatically initialized when the app loads. Simply:

1. **Start Using**: Click the 🌐 button to open the inventory
2. **Add Materials**: Click items to set your current quantities
3. **Track Progress**: See real-time completion status for your projects
4. **Organize**: Use categories and filters to find what you need quickly

The system integrates seamlessly with your existing ship upgrade tracking, providing a unified view of all materials across all your active projects.

## Advanced Features

### Import/Export
- Export your inventory data as JSON for backup
- Import data to restore or transfer between devices
- Bulk update capabilities for advanced users

### Cross-Project Analytics
- See which materials are shared across multiple projects
- Identify bottlenecks in your crafting pipeline
- Prioritize material gathering based on project needs

### Barter Integration
- Automatic detection of items available through barter
- Visual indicators for alternative acquisition methods
- Links to barter chain information

The Global Inventory System transforms material management from a tedious task into an intuitive, game-like experience that helps you efficiently plan and track your BDO ship upgrade journey.