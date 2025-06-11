// Example: E-commerce service with performance issues
// This demonstrates a typical N+1 query pattern that Claude Code might struggle to identify

import { Database } from './database';

class OrderService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // Problematic function with N+1 query pattern
  async getOrdersWithDetails(userId: string) {
    // First query: Get all orders for user
    const orders = await this.db.query(
      'SELECT * FROM orders WHERE user_id = ?',
      [userId]
    );

    // N+1 Problem: For each order, fetch additional data
    for (const order of orders) {
      // Additional query for each order (N queries)
      order.items = await this.db.query(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );

      // Another N queries for customer info
      order.customer = await this.db.query(
        'SELECT * FROM customers WHERE id = ?',
        [order.customer_id]
      );

      // And N more for shipping info
      order.shipping = await this.db.query(
        'SELECT * FROM shipping_info WHERE order_id = ?',
        [order.id]
      );
    }

    return orders;
  }

  // Another issue: Memory leak with event listeners
  startOrderMonitoring() {
    // Setting up interval without cleanup
    setInterval(() => {
      this.checkPendingOrders();
    }, 5000);

    // Adding event listener without removal
    process.on('order-update', (orderId) => {
      this.updateOrderCache(orderId);
    });
  }

  private orderCache: Map<string, any> = new Map();

  private async checkPendingOrders() {
    const pendingOrders = await this.db.query(
      'SELECT * FROM orders WHERE status = ?',
      ['pending']
    );

    // Potential memory leak: cache grows indefinitely
    for (const order of pendingOrders) {
      this.orderCache.set(order.id, order);
    }
  }

  private updateOrderCache(orderId: string) {
    // Update cache logic
  }
}

// Example of cross-service dependency
class InventoryService {
  async updateStock(orderItems: any[]) {
    // This service is called by OrderService
    // Changes here could break OrderService
    for (const item of orderItems) {
      await this.decrementStock(item.product_id, item.quantity);
    }
  }

  private async decrementStock(productId: string, quantity: number) {
    // Complex state management that could have race conditions
    const currentStock = await this.getStock(productId);
    if (currentStock >= quantity) {
      await this.setStock(productId, currentStock - quantity);
    }
  }

  private async getStock(productId: string): Promise<number> {
    // Fetch current stock
    return 0;
  }

  private async setStock(productId: string, quantity: number): Promise<void> {
    // Update stock
  }
}