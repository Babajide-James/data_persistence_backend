import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(__dirname, '..', 'data.json');

class JSONDatabase {
  data: any[] = [];
  
  constructor() {
    if (fs.existsSync(DB_FILE)) {
      this.data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  }

  save() {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
  }

  async findByName(name: string) {
    return this.data.find(d => d.name === name);
  }

  async findById(id: string) {
    return this.data.find(d => d.id === id);
  }
  
  async deleteById(id: string) {
    const idx = this.data.findIndex(d => d.id === id);
    if (idx !== -1) {
      this.data.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  async filter(gender?: string, country_id?: string, age_group?: string) {
    return this.data.filter(d => {
      if (gender && d.gender?.toLowerCase() !== gender) return false;
      if (country_id && d.country_id?.toLowerCase() !== country_id) return false;
      if (age_group && d.age_group?.toLowerCase() !== age_group) return false;
      return true;
    });
  }
  
  async insert(record: any) {
    this.data.push(record);
    this.save();
  }
}

let dbInstance: JSONDatabase | null = null;

export async function getDb() {
  if (!dbInstance) {
    dbInstance = new JSONDatabase();
  }
  return dbInstance;
}
