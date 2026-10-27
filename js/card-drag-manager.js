/**
 * @fileoverview Card drag and drop manager with stable placeholder-based reordering
 * @author BRADSEC
 */

import { DOMCache } from './dom-cache.js?v=1.3.21';

class CardDragManager {
    constructor(containerSelector, onReorder) {
        this.container = DOMCache.querySelector(containerSelector);
        this.onReorder = onReorder;
        this.draggedElement = null;
        this.placeholder = null;
        this.draggedIndex = -1;
        this.isDragging = false;
        this.pointerId = null;
        this.startX = 0;
        this.startY = 0;
        this.pointerOffsetX = 0;
        this.pointerOffsetY = 0;

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

        this.container.addEventListener('pointerdown', this.handlePointerStartBound);
        document.addEventListener('pointermove', this.handlePointerMoveBound);
        document.addEventListener('pointerup', this.handlePointerEndBound);
        document.addEventListener('pointercancel', this.handlePointerEndBound);
    }

    handlePointerStart(event) {
        if (event.button !== 0 || this.draggedElement) {
            return;
        }

        if (event.target.closest('.delete-file-button') ||
            event.target.closest('.order-number') ||
            event.target.closest('.rotation-controls') ||
            event.target.closest('.image-layout-card-select') ||
            event.target.tagName === 'INPUT' ||
            event.target.tagName === 'SELECT' ||
            event.target.tagName === 'OPTION') {
            return;
        }

        const cardElement = event.target.closest('li');
        if (!cardElement || !this.container.contains(cardElement)) {
            return;
        }

        const rect = cardElement.getBoundingClientRect();

        this.draggedElement = cardElement;
        this.draggedIndex = this.getCardIndex(cardElement);
        this.pointerId = event.pointerId;
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.pointerOffsetX = event.clientX - rect.left;
        this.pointerOffsetY = event.clientY - rect.top;

        this.draggedElement.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    handlePointerMove(event) {
        if (!this.draggedElement || event.pointerId !== this.pointerId) {
            return;
        }

        const deltaX = event.clientX - this.startX;
        const deltaY = event.clientY - this.startY;

        if (!this.isDragging && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
            this.startDragging(event.clientX, event.clientY);
        }

        if (!this.isDragging) {
            return;
        }

        event.preventDefault();
        this.positionDraggedElement(event.clientX, event.clientY);
        this.updatePlaceholderPosition(event.clientX, event.clientY);
    }

    handlePointerEnd(event) {
        if (!this.draggedElement || event.pointerId !== this.pointerId) {
            return;
        }

        if (this.isDragging) {
            this.finishDragging();
        }

        this.cleanupDragState();
    }

    startDragging(pointerX, pointerY) {
        const rect = this.draggedElement.getBoundingClientRect();

        this.isDragging = true;
        this.placeholder = this.createPlaceholder(rect);
        this.draggedElement.after(this.placeholder);
        document.body.appendChild(this.draggedElement);

        this.draggedElement.classList.add('is-dragging');
        this.draggedElement.style.width = `${rect.width}px`;
        this.draggedElement.style.height = `${rect.height}px`;
        this.draggedElement.style.left = `${rect.left}px`;
        this.draggedElement.style.top = `${rect.top}px`;
        this.draggedElement.style.position = 'fixed';
        this.draggedElement.style.zIndex = '1000';
        this.draggedElement.style.pointerEvents = 'none';
        this.draggedElement.style.margin = '0';

        document.body.classList.add('dragging-cards');
        this.positionDraggedElement(pointerX, pointerY);
    }

    createPlaceholder(rect) {
        const placeholder = document.createElement('li');
        placeholder.className = 'drag-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.width = `${rect.width}px`;
        placeholder.style.height = `${rect.height}px`;
        return placeholder;
    }

    positionDraggedElement(pointerX, pointerY) {
        const left = pointerX - this.pointerOffsetX;
        const top = pointerY - this.pointerOffsetY;
        this.draggedElement.style.transform = `translate3d(${left - parseFloat(this.draggedElement.style.left)}px, ${top - parseFloat(this.draggedElement.style.top)}px, 0)`;
    }

    updatePlaceholderPosition(pointerX, pointerY) {
        const cards = this.getActiveCards();
        if (cards.length === 0) {
            return;
        }

        const beforeRects = this.captureCardPositions(cards);
        const insertBefore = this.findInsertionTarget(cards, pointerX, pointerY);

        if (insertBefore) {
            if (insertBefore !== this.placeholder.nextElementSibling) {
                this.container.insertBefore(this.placeholder, insertBefore);
                this.animateLayoutShift(beforeRects);
            }
            return;
        }

        if (this.placeholder !== this.container.lastElementChild) {
            this.container.appendChild(this.placeholder);
            this.animateLayoutShift(beforeRects);
        }
    }

    findInsertionTarget(cards, pointerX, pointerY) {
        const cardRects = cards.map((card) => ({
            card,
            rect: card.getBoundingClientRect()
        }));
        const rows = [];
        const rowTolerance = 24;

        cardRects
            .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))
            .forEach((entry) => {
                const lastRow = rows[rows.length - 1];
                if (!lastRow || Math.abs(lastRow.top - entry.rect.top) > rowTolerance) {
                    rows.push({ top: entry.rect.top, items: [entry] });
                    return;
                }
                lastRow.items.push(entry);
            });

        for (const row of rows) {
            const rowTop = Math.min(...row.items.map((item) => item.rect.top));
            const rowBottom = Math.max(...row.items.map((item) => item.rect.bottom));
            const rowMidY = rowTop + ((rowBottom - rowTop) / 2);

            if (pointerY < rowMidY) {
                return this.findInsertionTargetInRow(row.items, pointerX);
            }
        }

        const lastRow = rows[rows.length - 1];
        if (!lastRow) {
            return null;
        }

        if (pointerY <= Math.max(...lastRow.items.map((item) => item.rect.bottom))) {
            return this.findInsertionTargetInRow(lastRow.items, pointerX);
        }

        return null;
    }

    findInsertionTargetInRow(rowItems, pointerX) {
        const sortedRowItems = [...rowItems].sort((a, b) => a.rect.left - b.rect.left);

        for (const item of sortedRowItems) {
            const midpointX = item.rect.left + (item.rect.width / 2);
            if (pointerX < midpointX) {
                return item.card;
            }
        }

        let sibling = sortedRowItems[sortedRowItems.length - 1].card.nextElementSibling;
        if (sibling === this.placeholder) {
            sibling = this.placeholder.nextElementSibling;
        }
        return sibling;
    }

    captureCardPositions(cards) {
        return cards.map((card) => ({
            fileId: card.dataset.fileId,
            rect: card.getBoundingClientRect()
        }));
    }

    animateLayoutShift(beforeRects) {
        requestAnimationFrame(() => {
            this.getActiveCards().forEach((card) => {
                const previous = beforeRects.find((entry) => entry.fileId === card.dataset.fileId);
                if (!previous) {
                    return;
                }

                const currentRect = card.getBoundingClientRect();
                const deltaX = previous.rect.left - currentRect.left;
                const deltaY = previous.rect.top - currentRect.top;

                if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
                    return;
                }

                card.style.transition = 'none';
                card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
                card.offsetHeight;
                card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0.2, 1)';
                card.style.transform = '';

                window.setTimeout(() => {
                    if (!card.classList.contains('is-dragging')) {
                        card.style.transition = '';
                        card.style.transform = '';
                    }
                }, 220);
            });
        });
    }

    finishDragging() {
        const newIndex = this.getPlaceholderIndex();

        this.container.insertBefore(this.draggedElement, this.placeholder);
        this.placeholder.remove();
        this.placeholder = null;

        this.resetDraggedElementStyles();

        if (newIndex !== this.draggedIndex && this.onReorder) {
            this.onReorder(this.draggedIndex, newIndex);
        }
    }

    getPlaceholderIndex() {
        const cards = Array.from(this.container.querySelectorAll('li')).filter((card) => card !== this.draggedElement);
        return cards.indexOf(this.placeholder);
    }

    getCardIndex(cardElement) {
        return Array.from(this.container.querySelectorAll('li')).indexOf(cardElement);
    }

    getActiveCards() {
        return Array.from(this.container.querySelectorAll('li')).filter((card) => (
            card !== this.draggedElement &&
            card !== this.placeholder
        ));
    }

    animateReorder(fromIndex, toIndex) {
        if (!this.onReorder) {
            return;
        }

        const cards = Array.from(this.container.children).filter((child) => child.tagName.toLowerCase() === 'li');
        const initialPositions = cards.map((card) => ({
            fileId: card.dataset.fileId,
            rect: card.getBoundingClientRect()
        }));

        this.onReorder(fromIndex, toIndex);

        requestAnimationFrame(() => {
            const finalCards = Array.from(this.container.children).filter((child) => child.tagName.toLowerCase() === 'li');

            finalCards.forEach((card) => {
                const initialPos = initialPositions.find((entry) => entry.fileId === card.dataset.fileId);
                if (!initialPos) {
                    return;
                }

                const finalRect = card.getBoundingClientRect();
                const deltaX = initialPos.rect.left - finalRect.left;
                const deltaY = initialPos.rect.top - finalRect.top;

                if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
                    return;
                }

                card.style.transition = 'none';
                card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
                card.offsetHeight;
                card.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                card.style.transform = 'translate3d(0, 0, 0)';

                window.setTimeout(() => {
                    card.style.transition = '';
                    card.style.transform = '';
                }, 350);
            });
        });
    }

    animateClickReorder(cardIndex) {
        if (!this.onReorder) {
            return;
        }

        const cards = Array.from(this.container.children).filter((child) => child.tagName.toLowerCase() === 'li');
        const targetCard = cards[cardIndex];
        if (!targetCard) {
            return;
        }

        targetCard.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, filter 0.25s ease';
        targetCard.style.transform = 'scale(1.08) translateY(-2px)';
        targetCard.style.boxShadow = '0 12px 30px rgba(37, 99, 235, 0.4)';
        targetCard.style.filter = 'brightness(1.1)';
        targetCard.style.zIndex = '999';
        targetCard.style.outline = '2px solid rgba(37, 99, 235, 0.5)';
        targetCard.style.outlineOffset = '2px';

        window.setTimeout(() => {
            targetCard.style.transform = 'scale(1) translateY(0)';
            targetCard.style.boxShadow = '';
            targetCard.style.filter = '';
            targetCard.style.outline = '';
            targetCard.style.outlineOffset = '';

            const lastIndex = cards.length - 1;
            if (cardIndex !== lastIndex) {
                this.animateReorder(cardIndex, lastIndex);
            }

            window.setTimeout(() => {
                targetCard.style.transition = '';
                targetCard.style.zIndex = '';
            }, 350);
        }, 250);
    }

    makeDraggable() {
        const cards = this.container?.querySelectorAll('li') ?? [];
        cards.forEach((card) => {
            card.draggable = false;
            card.style.cursor = 'grab';
            card.style.touchAction = 'none';
        });
    }

    cleanupDragState() {
        this.draggedElement?.releasePointerCapture?.(this.pointerId);
        this.draggedElement = null;
        this.draggedIndex = -1;
        this.pointerId = null;
        this.isDragging = false;
    }

    resetDraggedElementStyles() {
        if (!this.draggedElement) {
            document.body.classList.remove('dragging-cards');
            return;
        }

        this.draggedElement.style.position = '';
        this.draggedElement.style.left = '';
        this.draggedElement.style.top = '';
        this.draggedElement.style.width = '';
        this.draggedElement.style.height = '';
        this.draggedElement.style.zIndex = '';
        this.draggedElement.style.pointerEvents = '';
        this.draggedElement.style.margin = '';
        this.draggedElement.style.transform = '';
        this.draggedElement.classList.remove('is-dragging');
        document.body.classList.remove('dragging-cards');
    }

    destroy() {
        if (this.container) {
            this.container.removeEventListener('pointerdown', this.handlePointerStartBound);
        }

        document.removeEventListener('pointermove', this.handlePointerMoveBound);
        document.removeEventListener('pointerup', this.handlePointerEndBound);
        document.removeEventListener('pointercancel', this.handlePointerEndBound);

        if (this.placeholder) {
            if (this.draggedElement && this.draggedElement.parentElement !== this.container) {
                this.container?.insertBefore(this.draggedElement, this.placeholder);
            }
            this.placeholder.remove();
            this.placeholder = null;
        }

        this.resetDraggedElementStyles();
        this.cleanupDragState();
        this.container = null;
        this.onReorder = null;
    }
}

export { CardDragManager };
