import { Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '../database';

// Types for responses
interface GenderizeResponse {
  count: number;
  name: string;
  gender: string | null;
  probability: number;
}

interface AgifyResponse {
  age: number | null;
  count: number;
  name: string;
}

interface NationalizeResponse {
  count: number;
  name: string;
  country: { country_id: string; probability: number }[];
}

export const createProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Missing or empty name' });
      return;
    }

    const normalizedName = name.trim().toLowerCase();
    const db = await getDb();

    // Idempotency check
    const existingProfile = await db.findByName(normalizedName);
    if (existingProfile) {
      // Re-map db row to match response exactly
      const returnedProfile = { ...existingProfile };

      res.status(201).json({
        status: 'success',
        message: 'Profile already exists',
        data: returnedProfile
      });
      return;
    }

    // Fetch data concurrently
    const [genderRes, ageRes, nationRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${encodeURIComponent(normalizedName)}`),
      fetch(`https://api.agify.io?name=${encodeURIComponent(normalizedName)}`),
      fetch(`https://api.nationalize.io?name=${encodeURIComponent(normalizedName)}`)
    ]);

    if (!genderRes.ok) {
      res.status(502).json({ status: 'error', message: 'Genderize returned an invalid response' });
      return;
    }
    if (!ageRes.ok) {
      res.status(502).json({ status: 'error', message: 'Agify returned an invalid response' });
      return;
    }
    if (!nationRes.ok) {
      res.status(502).json({ status: 'error', message: 'Nationalize returned an invalid response' });
      return;
    }

    const genderData = (await genderRes.json()) as GenderizeResponse;
    const ageData = (await ageRes.json()) as AgifyResponse;
    const nationData = (await nationRes.json()) as NationalizeResponse;

    // Validate Genderize response
    if (genderData.gender === null || genderData.count === 0) {
      res.status(502).json({ status: 'error', message: 'Genderize returned an invalid response' });
      return;
    }

    // Validate Agify response
    if (ageData.age === null) {
      res.status(502).json({ status: 'error', message: 'Agify returned an invalid response' });
      return;
    }

    // Validate Nationalize response
    if (!nationData.country || nationData.country.length === 0) {
      res.status(502).json({ status: 'error', message: 'Nationalize returned an invalid response' });
      return;
    }

    // Process Genderize
    const gender = genderData.gender;
    const gender_probability = genderData.probability;
    const sample_size = genderData.count;

    // Process Agify
    const age = ageData.age;
    let age_group = '';
    if (age <= 12) {
      age_group = 'child';
    } else if (age <= 19) {
      age_group = 'teenager';
    } else if (age <= 59) {
      age_group = 'adult';
    } else {
      age_group = 'senior';
    }

    // Process Nationalize (highest probability country)
    const sortedCountries = nationData.country.sort((a, b) => b.probability - a.probability);
    const country = sortedCountries[0];
    const country_id = country.country_id;
    const country_probability = country.probability;

    const id = uuidv7();
    const created_at = new Date().toISOString();

    const insertData = {
      id,
      name: normalizedName,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id,
      country_probability,
      created_at
    };

    await db.insert(insertData);

    res.status(201).json({
      status: 'success',
      data: insertData
    });
  } catch (error) {
    console.error('Error in createProfile:', error);
    res.status(500).json({ status: 'error', message: 'Internal server failure' });
  }
};

export const getProfileById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const profile = await db.findById(id);
    
    if (!profile) {
      res.status(404).json({ status: 'error', message: 'Profile not found' });
      return;
    }
    
    res.status(200).json({
      status: 'success',
      data: profile
    });
  } catch (error) {
    console.error('Error in getProfileById:', error);
    res.status(500).json({ status: 'error', message: 'Internal server failure' });
  }
};

export const getProfiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const gender = req.query.gender as string | undefined;
    const country_id = req.query.country_id as string | undefined;
    const age_group = req.query.age_group as string | undefined;
    
    const db = await getDb();
    const profiles = await db.filter(gender?.toLowerCase(), country_id?.toLowerCase(), age_group?.toLowerCase());
    
    const returnData = profiles.map(p => ({
      id: p.id,
      name: p.name,
      gender: p.gender,
      age: p.age,
      age_group: p.age_group,
      country_id: p.country_id
    }));

    res.status(200).json({
      status: 'success',
      count: returnData.length,
      data: returnData
    });
  } catch (error) {
    console.error('Error in getProfiles:', error);
    res.status(500).json({ status: 'error', message: 'Internal server failure' });
  }
};

export const deleteProfileById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const success = await db.deleteById(id);
    if (!success) {
      res.status(404).json({ status: 'error', message: 'Profile not found' });
      return;
    }
    
    res.status(204).send(); // 204 No Content
  } catch (error) {
    console.error('Error in deleteProfileById:', error);
    res.status(500).json({ status: 'error', message: 'Internal server failure' });
  }
};
