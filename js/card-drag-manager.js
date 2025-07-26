/**
 * @fileoverview Card drag and drop manager with smooth animations
 * @author BRADSEC
 */

import { DOMCache } from './dom-cache.js';

/**
 * Card Drag Manager - Handles drag and drop reordering with smooth animations
 * Uses mouse/touch events for better control than HTML5 drag API
 */
class CardDragManager {
    constructor(containerSelector, onReorder) {
        this.container = DOMCache.querySelector(containerSelector);
        this.onReorder = onReorder;
        this.draggedElement = null;
        this.draggedIndex = -1;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.itemsGap = 0;
        this.items = [];
        
        // Store bound methods for proper cleanup
        this.handlePointerStartBound = this.handlePointerStart.bind(this);
        this.handlePointerMoveBound = this.handlePointerMove.bind(this);
        this.handlePointerEndBound = this.handlePointerEnd.bind(this);
        
        this.init();
    }

    init() {
        if (!this.container) {
            console.warn('Card container not found');
            return;
        }

        this.addEventListeners();
    }

    addEventListeners() {
        // Use mouse/touch events instead of HTML5 drag API for better control
        this.container.addEventListener('mousedown', this.handlePointerStartBound);
        this.container.addEventListener('touchstart', this.handlePointerStartBound);
        
        document.addEventListener('mouseup', this.handlePointerEndBound);
        document.addEventListener('touchend', this.handlePointerEndBound);
    }

    handlePointerStart(e) {
        // Only handle clicks on cards, not delete buttons or inputs
        if (e.target.closest('.delete-file-button') || 
            e.target.closest('.order-number') ||
            e.target.tagName === 'INPUT') {
            return;
        }

        const cardElement = e.target.closest('li');
        if (!cardElement) return;

        this.draggedElement = cardElement;
        this.draggedIndex = Array.from(this.container.children).indexOf(cardElement);
        
        this.startX = e.clientX || e.touches[0].clientX;
        this.startY = e.clientY || e.touches[0].clientY;
        
        this.setItemsGap();
        this.initItemsState();
        
        // Add mouse/touch move listeners
        document.addEventListener('mousemove', this.handlePointerMoveBound);
        document.addEventListener('touchmove', this.handlePointerMoveBound, { passive: false });
        
        // Prevent default to avoid text selection
        e.preventDefault();
    }

    handlePointerMove(e) {
        if (!this.draggedElement) return;
        
        e.preventDefault();
        
        this.currentX = e.clientX || e.touches[0].clientX;
        this.currentY = e.clientY || e.touches[0].clientY;
        
        const deltaX = this.currentX - this.startX;
        const deltaY = this.currentY - this.startY;
        
        // Start dragging if moved more than 5px
        if (!this.isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
            this.startDragging();
        }
        
        if (this.isDragging) {
            // Move the dragged element
            this.draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            
            // Update other items positions
            this.updateItemsState();
        }
    }

    handlePointerEnd(e) {
        if (!this.draggedElement) return;
        
        if (this.isDragging) {
            this.finishDragging();
        }
        
        // Clean up
        document.removeEventListener('mousemove', this.handlePointerMoveBound);
        document.removeEventListener('touchmove', this.handlePointerMoveBound);
        
        this.draggedElement = null;
        this.draggedIndex = -1;
        this.isDragging = false;
    }

    startDragging() {
        this.isDragging = true;
        
        // Add dragging styles
        this.draggedElement.classList.add('is-dragging');
        this.draggedElement.style.zIndex = '1000';
        this.draggedElement.style.pointerEvents = 'none';
        
        // Disable page scroll
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
        
        // Mark other items as idle
        this.getIdleItems().forEach(item => {
            item.classList.add('is-idle');
        });
    }

    finishDragging() {
        // Apply new order
        this.applyNewItemsOrder();
        
        // Clean up styles
        this.draggedElement.classList.remove('is-dragging');
        this.draggedElement.style.zIndex = '';
        this.draggedElement.style.pointerEvents = '';
        this.draggedElement.style.transform = '';
        
        // Re-enable page scroll
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
        
        // Clean up other items
        this.getIdleItems().forEach(item => {
            item.classList.remove('is-idle');
            item.style.transform = '';
            delete item.dataset.isAbove;
            delete item.dataset.isToggled;
        });
    }

    setItemsGap() {
        const idleItems = this.getIdleItems();
        if (idleItems.length <= 1) {
            this.itemsGap = 0;
            return;
        }

        const item1 = idleItems[0];
        const item2 = idleItems[1];
        const item1Rect = item1.getBoundingClientRect();
        const item2Rect = item2.getBoundingClientRect();
        
        this.itemsGap = Math.abs(item1Rect.bottom - item2Rect.top);
    }

    initItemsState() {
        this.getIdleItems().forEach((item, i) => {
            const allItems = this.getAllItems();
            if (allItems.indexOf(this.draggedElement) > i) {
                item.dataset.isAbove = '';
            }
        });
    }

    updateItemsState() {
        const draggedRect = this.draggedElement.getBoundingClientRect();
        const draggedY = draggedRect.top + draggedRect.height / 2;

        // Update state
        this.getIdleItems().forEach((item) => {
            const itemRect = item.getBoundingClientRect();
            const itemY = itemRect.top + itemRect.height / 2;
            
            if (this.isItemAbove(item)) {
                if (draggedY <= itemY) {
                    item.dataset.isToggled = '';
                } else {
                    delete item.dataset.isToggled;
                }
            } else {
                if (draggedY >= itemY) {
                    item.dataset.isToggled = '';
                } else {
                    delete item.dataset.isToggled;
                }
            }
        });

        // Update positions
        this.getIdleItems().forEach((item) => {
            if (this.isItemToggled(item)) {
                const direction = this.isItemAbove(item) ? 1 : -1;
                const draggedRect = this.draggedElement.getBoundingClientRect();
                item.style.transform = `translateY(${direction * (draggedRect.height + this.itemsGap)}px)`;
            } else {
                item.style.transform = '';
            }
        });
    }

    applyNewItemsOrder() {
        const reorderedItems = [];
        const allItems = this.getAllItems();

        allItems.forEach((item, index) => {
            if (item === this.draggedElement) {
                return;
            }
            if (!this.isItemToggled(item)) {
                reorderedItems[index] = item;
                return;
            }
            const newIndex = this.isItemAbove(item) ? index + 1 : index - 1;
            reorderedItems[newIndex] = item;
        });

        for (let index = 0; index < allItems.length; index++) {
            const item = reorderedItems[index];
            if (typeof item === 'undefined') {
                reorderedItems[index] = this.draggedElement;
            }
        }

        // Calculate the new index for the callback
        const newIndex = reorderedItems.indexOf(this.draggedElement);
        if (newIndex !== this.draggedIndex && this.onReorder) {
            this.onReorder(this.draggedIndex, newIndex);
        }
    }

    getAllItems() {
        return Array.from(this.container.querySelectorAll('li'));
    }

    getIdleItems() {
        return this.getAllItems().filter(item => item !== this.draggedElement);
    }

    isItemAbove(item) {
        return item.hasAttribute('data-is-above');
    }

    isItemToggled(item) {
        return item.hasAttribute('data-is-toggled');
    }

    updateCardsVisibility(isDragging) {
        const cards = this.container.querySelectorAll('li');
        cards.forEach(card => {
            if (card !== this.draggedElement) {
                if (isDragging) {
                    card.style.opacity = '0.6';
                } else {
                    card.style.opacity = '';
                }
            }
        });
    }

    /**
     * Animate reordering using enhanced FLIP technique with smoother transitions
     */
    animateReorder(fromIndex, toIndex) {
        if (!this.onReorder) return;

        // Get initial positions (First) - only for non-drop-zone elements
        const cards = Array.from(this.container.children).filter(child => 
            child.tagName.toLowerCase() === 'li'
        );
        const initialPositions = cards.map(card => ({
            element: card,
            rect: card.getBoundingClientRect(),
            fileId: card.dataset.fileId
        }));

        // Perform the reorder (Last)
        this.onReorder(fromIndex, toIndex);

        // Wait for DOM update
        requestAnimationFrame(() => {
            // Get final positions and calculate differences (Invert)
            const finalCards = Array.from(this.container.children).filter(child => 
                child.tagName.toLowerCase() === 'li'
            );
            
            finalCards.forEach((card) => {
                const initialPos = initialPositions.find(pos => 
                    pos.fileId === card.dataset.fileId
                );
                
                if (initialPos) {
                    const finalRect = card.getBoundingClientRect();
                    const deltaX = initialPos.rect.left - finalRect.left;
                    const deltaY = initialPos.rect.top - finalRect.top;

                    // Skip animation if no movement
                    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

                    // Apply initial transform without transition
                    card.style.transition = 'none';
                    card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
                    card.style.willChange = 'transform';

                    // Force reflow
                    card.offsetHeight;

                    // Animate to final position (Play) with enhanced easing
                    card.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    card.style.transform = 'translate3d(0, 0, 0)';

                    // Clean up after animation
                    setTimeout(() => {
                        card.style.transition = '';
                        card.style.transform = '';
                        card.style.willChange = '';
                    }, 350);
                }
            });
        });
    }

    /**
     * Animate click-to-reorder (send to back) with enhanced feedback
     */
    animateClickReorder(cardIndex) {
        if (!this.onReorder) return;

        const cards = Array.from(this.container.children).filter(child => 
            child.tagName.toLowerCase() === 'li'
        );
        const targetCard = cards[cardIndex];
        
        if (!targetCard) return;

        // Add enhanced highlight effect with pulse
        targetCard.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, filter 0.25s ease';
        targetCard.style.transform = 'scale(1.08) translateY(-2px)';
        targetCard.style.boxShadow = '0 12px 30px rgba(37, 99, 235, 0.4)';
        targetCard.style.filter = 'brightness(1.1)';
        targetCard.style.zIndex = '999';

        // Add a subtle glow effect
        targetCard.style.outline = '2px solid rgba(37, 99, 235, 0.5)';
        targetCard.style.outlineOffset = '2px';

        setTimeout(() => {
            // Reset highlight with smooth transition
            targetCard.style.transform = 'scale(1) translateY(0)';
            targetCard.style.boxShadow = '';
            targetCard.style.filter = '';
            targetCard.style.outline = '';
            targetCard.style.outlineOffset = '';

            // Perform reorder to end with enhanced animation
            const lastIndex = cards.length - 1;
            if (cardIndex !== lastIndex) {
                this.animateReorder(cardIndex, lastIndex);
            }

            setTimeout(() => {
                targetCard.style.transition = '';
                targetCard.style.zIndex = '';
            }, 350);
        }, 250);
    }

    /**
     * Make all cards in container draggable with enhanced setup
     */
    makeDraggable() {
        const cards = this.container.querySelectorAll('li');
        cards.forEach((card, index) => {
            // Remove HTML5 draggable attribute since we're using pointer events
            card.draggable = false;
            
            // Ensure fileId exists for tracking
            if (!card.dataset.fileId) {
                card.dataset.fileId = `file-${index}-${Date.now()}`;
            }
            
            // Add drag cursor styling
            card.style.cursor = 'grab';
            
            // Add hover effects for better UX
            card.addEventListener('mouseenter', () => {
                if (!this.isDragging) {
                    card.style.transform = 'translateY(-1px)';
                    card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
                    card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }
            });
            
            card.addEventListener('mouseleave', () => {
                if (!this.isDragging && !card.classList.contains('is-dragging')) {
                    card.style.transform = '';
                    card.style.boxShadow = '';
                }
            });
        });
    }

    /**
     * Destroy the drag manager and clean up all event listeners
     */
    destroy() {
        if (this.container) {
            // Remove container event listeners
            this.container.removeEventListener('mousedown', this.handlePointerStartBound);
            this.container.removeEventListener('touchstart', this.handlePointerStartBound);
            
            // Remove document event listeners
            document.removeEventListener('mouseup', this.handlePointerEndBound);
            document.removeEventListener('touchend', this.handlePointerEndBound);
            document.removeEventListener('mousemove', this.handlePointerMoveBound);
            document.removeEventListener('touchmove', this.handlePointerMoveBound);
        }
        
        // Clean up any drag state
        if (this.isDragging) {
            this.finishDragging();
        }
        
        // Reset all properties
        this.draggedElement = null;
        this.draggedIndex = -1;
        this.isDragging = false;
        this.container = null;
        this.onReorder = null;
    }
}

export { CardDragManager };