export class UserService {
  private users: Map<string, User> = new Map();
  private preferences: Map<string, UserPreference[]> = new Map();

  async getUsersWithPreferences(userIds: string[]): Promise<UserWithPreferences[]> {
    const results: UserWithPreferences[] = [];
    
    // Potential performance issue: N+1 query pattern
    for (const userId of userIds) {
      const user = await this.fetchUser(userId);
      if (user) {
        // Another potential issue: fetching preferences one by one
        const prefs = await this.fetchUserPreferences(userId);
        
        // Potential memory issue: building large objects
        const enrichedUser = {
          ...user,
          preferences: prefs,
          // Expensive computation in loop
          score: this.calculateUserScore(user, prefs),
          recommendations: await this.generateRecommendations(user, prefs)
        };
        
        results.push(enrichedUser);
      }
    }
    
    return results;
  }

  private async fetchUser(userId: string): Promise<User | null> {
    // Simulating database call
    await this.delay(50);
    return this.users.get(userId) || null;
  }

  private async fetchUserPreferences(userId: string): Promise<UserPreference[]> {
    // Simulating another database call
    await this.delay(30);
    return this.preferences.get(userId) || [];
  }

  private calculateUserScore(user: User, preferences: UserPreference[]): number {
    // Expensive calculation
    let score = 0;
    for (let i = 0; i < 1000; i++) {
      score += user.activity * preferences.length * Math.random();
    }
    return score;
  }

  private async generateRecommendations(user: User, preferences: UserPreference[]): Promise<string[]> {
    // Simulating external API call
    await this.delay(100);
    return [`rec1_${user.id}`, `rec2_${user.id}`];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface User {
  id: string;
  name: string;
  activity: number;
}

interface UserPreference {
  key: string;
  value: string;
}

interface UserWithPreferences extends User {
  preferences: UserPreference[];
  score: number;
  recommendations: string[];
}