require('dotenv').config();
const supabase = require('./lib/supabase'); // Use the existing configured client

async function cleanDuplicates() {
    console.log('Fetching all recordings...');
    let allRecordings = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('final_recordings')
            .select('id, sentence_id, speaker_id, created_at, audio_path')
            .range(from, from + PAGE - 1)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching:', error);
            return;
        }
        if (!data || data.length === 0) break;
        allRecordings = allRecordings.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    console.log(`Found ${allRecordings.length} total recordings.`);

    // Group by sentence_id + speaker_id
    const groups = {};
    for (const rec of allRecordings) {
        const key = `${rec.sentence_id}_${rec.speaker_id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(rec);
    }

    let toDeleteDbIds = [];
    let toDeleteStoragePaths = [];

    for (const key in groups) {
        const group = groups[key];
        if (group.length > 1) {
            // Because we sorted by created_at DESC, the first one is the newest
            const keep = group[0];
            const removeList = group.slice(1);
            
            for (const r of removeList) {
                toDeleteDbIds.push(r.id);
                if (r.audio_path) {
                    const parts = r.audio_path.split('/');
                    const filename = parts[parts.length - 1];
                    toDeleteStoragePaths.push(filename);
                }
            }
        }
    }

    console.log(`Found ${toDeleteDbIds.length} duplicate recordings to delete.`);

    if (toDeleteDbIds.length > 0) {
        console.log('Deleting from DB in chunks of 50...');
        for (let i = 0; i < toDeleteDbIds.length; i += 50) {
            const chunk = toDeleteDbIds.slice(i, i + 50);
            const { error } = await supabase
                .from('final_recordings')
                .delete()
                .in('id', chunk);
            if (error) {
                console.error('Error deleting from DB:', error.message);
            } else {
                console.log(`Deleted DB chunk ${i/50 + 1}`);
            }
        }

        console.log('Deleting from Storage in chunks of 50...');
        for (let i = 0; i < toDeleteStoragePaths.length; i += 50) {
            const chunk = toDeleteStoragePaths.slice(i, i + 50);
            const { error } = await supabase.storage.from('recordings').remove(chunk);
            if (error) {
                console.error('Error deleting from Storage:', error.message);
            } else {
                console.log(`Deleted Storage chunk ${i/50 + 1}`);
            }
        }
    }

    console.log('Cleanup complete!');
}

cleanDuplicates();
