const supabase = require('../lib/supabase');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        // Read all valid IDs from the normalized CSV
        const csvPath = path.join(__dirname, '..', 'final_recordings.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(l => l.trim());
        const csvIds = new Set();
        for (let i = 1; i < lines.length; i++) {
            const id = parseInt(lines[i].split(',')[0]);
            if (!isNaN(id)) csvIds.add(id);
        }

        console.log(`CSV has ${csvIds.size} valid IDs`);

        // Fetch ALL recording IDs from database (paginate)
        const allDbIds = [];
        let offset = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('final_recordings')
                .select('id')
                .range(offset, offset + pageSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            data.forEach(r => allDbIds.push(r.id));
            if (data.length < pageSize) break;
            offset += pageSize;
        }

        console.log(`Database has ${allDbIds.length} recordings`);

        // Find IDs in database that are NOT in CSV
        const orphanIds = allDbIds.filter(id => !csvIds.has(id));
        console.log(`Found ${orphanIds.length} orphan records to delete`);

        if (orphanIds.length === 0) {
            return res.json({ message: 'Database already matches CSV', db_count: allDbIds.length, csv_count: csvIds.size });
        }

        // Delete orphan records in batches
        const BATCH = 500;
        let deleted = 0;
        for (let i = 0; i < orphanIds.length; i += BATCH) {
            const batch = orphanIds.slice(i, i + BATCH);
            const { error: delErr } = await supabase
                .from('final_recordings')
                .delete()
                .in('id', batch);
            if (delErr) throw delErr;
            deleted += batch.length;
        }

        res.json({
            message: `Cleaned up ${deleted} orphan records`,
            before: allDbIds.length,
            after: allDbIds.length - deleted,
            csv_count: csvIds.size
        });
    } catch (err) {
        console.error('Cleanup error:', err);
        res.status(500).json({ error: err.message });
    }
};
