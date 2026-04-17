"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DB_FILE = path_1.default.join(__dirname, '..', 'data.json');
class JSONDatabase {
    data = [];
    constructor() {
        if (fs_1.default.existsSync(DB_FILE)) {
            this.data = JSON.parse(fs_1.default.readFileSync(DB_FILE, 'utf-8'));
        }
    }
    save() {
        fs_1.default.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
    }
    async findByName(name) {
        return this.data.find(d => d.name === name);
    }
    async findById(id) {
        return this.data.find(d => d.id === id);
    }
    async deleteById(id) {
        const idx = this.data.findIndex(d => d.id === id);
        if (idx !== -1) {
            this.data.splice(idx, 1);
            this.save();
            return true;
        }
        return false;
    }
    async filter(gender, country_id, age_group) {
        return this.data.filter(d => {
            if (gender && d.gender?.toLowerCase() !== gender)
                return false;
            if (country_id && d.country_id?.toLowerCase() !== country_id)
                return false;
            if (age_group && d.age_group?.toLowerCase() !== age_group)
                return false;
            return true;
        });
    }
    async insert(record) {
        this.data.push(record);
        this.save();
    }
}
let dbInstance = null;
async function getDb() {
    if (!dbInstance) {
        dbInstance = new JSONDatabase();
    }
    return dbInstance;
}
